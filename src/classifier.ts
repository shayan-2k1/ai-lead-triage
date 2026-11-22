import type { InboundMessage, Team } from './data'

export type Intent =
  | 'Service request'
  | 'Quote request'
  | 'Complaint'
  | 'Billing'
  | 'Scheduling change'
  | 'Feedback'
  | 'Vendor pitch'

export type Urgency = 'Emergency' | 'High' | 'Normal' | 'Low'
export type ServiceLine = 'HVAC' | 'Plumbing' | 'Electrical' | 'General'

export interface Signal {
  phrase: string
  effect: string
}

export interface Classification {
  intent: Intent
  intentConfidence: number
  urgency: Urgency
  serviceLine: ServiceLine
  leadScore: number | null
  sentiment: 'Negative' | 'Neutral' | 'Positive'
  location: string | null
  signals: Signal[]
  safetyNote: string | null
}

type Rule = { re: RegExp; weight: number; label?: string }

const INTENT_RULES: Record<Intent, Rule[]> = {
  'Service request': [
    { re: /\b(stopped working|not working|broke|broken|won'?t (turn|start)|leak(ing)?|drip|noise|grinding|buzzing|tripping|no heat|no hot water|repair|take a look|fix)\b/i, weight: 2 },
    { re: /\b(burst|pouring|flood(ing)?|smell (of )?gas|gas smell|smell gas|burning)\b/i, weight: 3 },
    { re: /\b(schedule a repair|send someone|need someone|come out)\b/i, weight: 2 },
  ],
  'Quote request': [
    { re: /\b(quote|estimate|pricing|price|ballpark|proposal|how much|cost)\b/i, weight: 2 },
    { re: /\b(replace|replacement|install(ed|ation)?|new system|upgrade|switch(ing)? to|contract)\b/i, weight: 1.5 },
  ],
  Complaint: [
    { re: /\b(disappointed|unacceptable|late|mess|rude|refund|discount|terrible|worst|frustrated|higher than)\b/i, weight: 2 },
    { re: /\b(no call|never showed|left .* all over)\b/i, weight: 2 },
  ],
  Billing: [
    { re: /\b(invoice|charged|charge|bill|payment|pay|card ending|refund the duplicate|receipt)\b/i, weight: 2.5 },
  ],
  'Scheduling change': [
    { re: /\b(reschedule|move it|cancel|push (it )?back|different (day|time)|something came up)\b/i, weight: 3 },
    { re: /\b(appointment|booked)\b/i, weight: 1 },
  ],
  Feedback: [
    { re: /\b(thank you|thanks|great job|professional|recommend|use you again)\b/i, weight: 2.5 },
  ],
  'Vendor pitch': [
    { re: /\b(guaranteed|limited spots|our (proven )?(ad )?system|15 minutes on your calendar|booked jobs|seo|leads? per month|partner(ship)?s?@)\b/i, weight: 3 },
  ],
}

const EMERGENCY: Rule[] = [
  { re: /\b(smell (of )?gas|gas smell|smell gas|gas leak)\b/i, weight: 5, label: 'possible gas leak' },
  { re: /\b(carbon monoxide|co alarm)\b/i, weight: 5, label: 'carbon monoxide' },
  { re: /\b(burst|pouring|flood(ing)?|water everywhere)\b/i, weight: 4, label: 'active water damage' },
  { re: /\b(burning (plastic|smell)|smells? .*burning|sparks?|smoke)\b/i, weight: 4, label: 'electrical burning smell' },
  { re: /\b(newborn|baby|elderly|infant)\b/i, weight: 2, label: 'vulnerable occupant' },
  { re: /\b(3\d|2\d) degrees\b/i, weight: 2, label: 'unsafe indoor temperature' },
  { re: /\b(no heat|heater stopped|furnace (stopped|out))\b/i, weight: 2, label: 'no heat' },
  { re: /\b(now|asap|as soon as (you|possible)|(?<!not )urgent)\b/i, weight: 1, label: 'caller asked for urgency' },
  { re: /\b(today|tonight)\b/i, weight: 1, label: 'same-day request' },
  { re: /\b(leaking all over|leaking|water on the floor)\b/i, weight: 1, label: 'water leak' },
]

const LOW: RegExp = /\b(not urgent|whenever|no rush|next couple weeks)\b/i

const SERVICE: Record<Exclude<ServiceLine, 'General'>, RegExp> = {
  HVAC: /\b(ac|a\/c|(?<!water )heater|heat pump|furnace|hvac|duct|rooftop units?|cooling|igniter|tune-up|thermostat)\b/i,
  Plumbing: /\b(pipe|faucet|water heater|tankless|leak|drain|toilet|softener|plumb|ceiling)\b/i,
  Electrical: /\b(panel|breaker|outlet|wiring|generator|electrical)\b/i,
}

const CITIES = ['Plano', 'Frisco', 'McKinney', 'Allen']

const HIGH_VALUE = [
  { re: /\b(whole (system|home)|replace the whole|new system|heat pump|generator)\b/i, pts: 30, label: 'full system / major install' },
  { re: /\b(commercial|rooftop units?|suites?|contract|quarterly)\b/i, pts: 30, label: 'commercial recurring work' },
  { re: /\b(tankless|softener)\b/i, pts: 15, label: 'mid-ticket install' },
  { re: /\b(\d,?\d{3} sq ?ft)\b/i, pts: 10, label: 'property size given' },
  { re: /\b(before summer|next quarter|this week|weekdays)\b/i, pts: 10, label: 'clear timeline' },
  { re: /\b(financing)\b/i, pts: 5, label: 'asked about financing' },
]

function firstMatch(re: RegExp, text: string) {
  const m = text.match(re)
  return m ? m[0] : null
}

export function classify(msg: Pick<InboundMessage, 'body' | 'subject' | 'contact'>): Classification {
  const text = `${msg.subject ?? ''} ${msg.body}`
  const signals: Signal[] = []

  // Intent
  const scores = Object.fromEntries(Object.keys(INTENT_RULES).map((k) => [k, 0])) as Record<Intent, number>
  for (const [intent, rules] of Object.entries(INTENT_RULES) as [Intent, Rule[]][]) {
    for (const r of rules) {
      const hit = firstMatch(r.re, text)
      if (hit) {
        scores[intent] += r.weight
        signals.push({ phrase: hit, effect: `+${r.weight} ${intent.toLowerCase()}` })
      }
    }
  }
  const ranked = (Object.entries(scores) as [Intent, number][]).sort((a, b) => b[1] - a[1])
  let [intent, top] = ranked[0]
  const second = ranked[1][1]
  if (top === 0) intent = 'Service request'
  const intentConfidence = top === 0 ? 0.35 : Math.min(0.98, 0.5 + (top - second) / (top + 2))

  // Urgency
  let urgencyScore = 0
  const safetyFlags: string[] = []
  for (const r of EMERGENCY) {
    const hit = firstMatch(r.re, text)
    if (hit) {
      urgencyScore += r.weight
      signals.push({ phrase: hit, effect: `urgency +${r.weight} (${r.label})` })
      if (r.weight >= 4) safetyFlags.push(r.label!)
    }
  }
  const lowHit = firstMatch(LOW, text)
  if (lowHit) signals.push({ phrase: lowHit, effect: 'urgency lowered (customer said no rush)' })
  let urgency: Urgency =
    urgencyScore >= 4 ? 'Emergency' : lowHit ? 'Low' : urgencyScore >= 2 ? 'High' : 'Normal'
  if (intent === 'Vendor pitch' || intent === 'Feedback') urgency = 'Low'
  if (intent === 'Complaint' && urgency === 'Normal') urgency = 'High'

  // Service line
  let serviceLine: ServiceLine = 'General'
  let best = 0
  for (const [line, re] of Object.entries(SERVICE) as [ServiceLine, RegExp][]) {
    const all = text.match(new RegExp(re.source, 'gi'))
    if (all && all.length > best) {
      best = all.length
      serviceLine = line
    }
  }

  if (intent === 'Vendor pitch') serviceLine = 'General'

  // Lead score for quotes
  let leadScore: number | null = null
  if (intent === 'Quote request') {
    leadScore = 30
    for (const h of HIGH_VALUE) {
      const hit = firstMatch(h.re, text)
      if (hit) {
        leadScore += h.pts
        signals.push({ phrase: hit, effect: `lead score +${h.pts} (${h.label})` })
      }
    }
    leadScore = Math.min(100, leadScore)
  }

  const sentiment =
    scores.Complaint >= 2 ? 'Negative' : scores.Feedback >= 2 ? 'Positive' : 'Neutral'
  const location = CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(text)) ?? null

  let safetyNote: string | null = null
  if (safetyFlags.includes('possible gas leak'))
    safetyNote = 'Possible gas leak. Call the customer now and follow the gas safety script: leave the house, no switches, call the gas utility from outside.'
  else if (safetyFlags.includes('electrical burning smell'))
    safetyNote = 'Burning smell from an electrical panel. Call now and advise switching off the main breaker if safe to do so.'
  else if (safetyFlags.includes('active water damage'))
    safetyNote = 'Active water damage. Confirm the main water valve is off and dispatch the nearest plumber.'

  return {
    intent,
    intentConfidence: Math.round(intentConfidence * 100) / 100,
    urgency,
    serviceLine,
    leadScore,
    sentiment,
    location,
    signals,
    safetyNote,
  }
}

export interface RoutingRule {
  id: string
  label: string
  when: (c: Classification) => boolean
  team: Team
  enabled: boolean
}

export const DEFAULT_RULES: { id: string; label: string; team: Team }[] = [
  { id: 'r-emergency', label: 'Urgency is Emergency', team: 'Dispatch' },
  { id: 'r-vendor', label: 'Intent is Vendor pitch', team: 'Ignore' },
  { id: 'r-billing', label: 'Intent is Billing', team: 'Billing' },
  { id: 'r-complaint', label: 'Intent is Complaint', team: 'Customer care' },
  { id: 'r-quote-hot', label: 'Quote request with lead score 70+', team: 'Sales' },
  { id: 'r-quote', label: 'Any other quote request', team: 'Sales' },
  { id: 'r-service', label: 'Service request or scheduling change', team: 'Dispatch' },
  { id: 'r-feedback', label: 'Intent is Feedback', team: 'Customer care' },
]

export const RULE_TESTS: Record<string, (c: Classification) => boolean> = {
  'r-emergency': (c) => c.urgency === 'Emergency',
  'r-vendor': (c) => c.intent === 'Vendor pitch',
  'r-billing': (c) => c.intent === 'Billing',
  'r-complaint': (c) => c.intent === 'Complaint',
  'r-quote-hot': (c) => c.intent === 'Quote request' && (c.leadScore ?? 0) >= 70,
  'r-quote': (c) => c.intent === 'Quote request',
  'r-service': (c) => c.intent === 'Service request' || c.intent === 'Scheduling change',
  'r-feedback': (c) => c.intent === 'Feedback',
}

export function route(
  c: Classification,
  rules: { id: string; team: Team; enabled: boolean }[],
): { team: Team; ruleId: string | null } {
  for (const r of rules) {
    if (r.enabled && RULE_TESTS[r.id]?.(c)) return { team: r.team, ruleId: r.id }
  }
  return { team: 'Customer care', ruleId: null }
}

const firstName = (n: string) => (n === 'Unknown' ? 'there' : n.split(' ')[0])

export function draftReply(msg: InboundMessage, c: Classification): string {
  const name = firstName(msg.from)
  const where = c.location ? ` in ${c.location}` : ''
  switch (c.intent) {
    case 'Service request':
      if (c.urgency === 'Emergency')
        return `Hi ${name}, this is Ridgeline Home Services. We got your message and are treating it as an emergency. A dispatcher is calling you right now at ${msg.contact}. ${
          c.safetyNote?.includes('gas')
            ? 'Until we reach you: please leave the house, avoid using light switches or flames, and call your gas utility from outside.'
            : c.safetyNote?.includes('water')
              ? 'Keep the main water valve off and move anything valuable away from the leak.'
              : c.safetyNote?.includes('electrical')
                ? 'If it is safe, switch off the main breaker and stay away from the panel.'
                : 'Stay warm and keep interior doors closed to hold heat in one room.'
        }`
      return `Hi ${name}, thanks for reaching out about the ${c.serviceLine === 'General' ? 'issue' : (c.serviceLine === 'HVAC' ? 'HVAC' : c.serviceLine.toLowerCase()) + ' issue'}${where}. We have openings [check: next two available slots]. Which works better for you? A technician will text when they're on the way.`
    case 'Quote request':
      return `Hi ${name}, thanks for considering Ridgeline for this. To give you an accurate price we'd like to do a free on-site assessment${where}, about 45 minutes. Do any of these times work: [check: two slots]? We'll send written options afterwards${
        /financ/i.test(msg.body) ? ', including financing terms' : ''
      }.`
    case 'Complaint':
      return `Hi ${name}, I'm sorry about this. That's not the experience we want you to have. I'm the customer care lead and I'd like to make it right. Can I call you today to sort out next steps? [check: offer approved by manager]`
    case 'Billing':
      return `Hi ${name}, thanks for flagging this. I'm looking into it now and will reply within one business day${
        /twice|duplicate/i.test(msg.body) ? ' to confirm the duplicate charge refund' : ''
      }. You can also pay or view invoices online at [check: payment link].`
    case 'Scheduling change':
      return `Hi ${name}, no problem. We can move your appointment. We have [check: Friday AM / Monday PM] open. Which would you prefer?`
    case 'Feedback':
      return `Hi ${name}, thank you for taking the time to write this. I'll pass it on to the team. If you have a minute, a review would really help us: [check: review link].`
    case 'Vendor pitch':
      return 'No reply needed. Archived as a vendor pitch.'
  }
}
