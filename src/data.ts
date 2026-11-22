export type Channel = 'Web form' | 'Email' | 'Missed-call transcript' | 'SMS'

export interface InboundMessage {
  id: string
  channel: Channel
  from: string
  contact: string
  subject?: string
  body: string
  receivedMinutesAgo: number
}

export const COMPANY = {
  name: 'Ridgeline Home Services',
  area: 'Plano · Frisco · McKinney · Allen',
}

export const TEAMS = ['Dispatch', 'Sales', 'Billing', 'Customer care', 'Ignore'] as const
export type Team = (typeof TEAMS)[number]

export const SEED_MESSAGES: InboundMessage[] = [
  {
    id: 'm01',
    channel: 'Missed-call transcript',
    from: 'Denise Harper',
    contact: '(469) 555-0142',
    body: "Hi, this is Denise on Hollow Ridge Drive in Frisco. Our heater stopped working last night and it's 38 degrees in the house. I have a newborn at home. Please call me back as soon as you can.",
    receivedMinutesAgo: 6,
  },
  {
    id: 'm02',
    channel: 'Web form',
    from: 'Marcus Lee',
    contact: 'marcus.lee@example.com',
    subject: 'Quote for new AC system',
    body: "We bought a 2,400 sq ft house in McKinney and the AC unit is from 2006. Looking for a quote to replace the whole system, ideally a high-efficiency heat pump. We'd like it done before summer. Weekdays after 4pm work best for a visit.",
    receivedMinutesAgo: 14,
  },
  {
    id: 'm03',
    channel: 'Email',
    from: 'Priya Natarajan',
    contact: 'priya.n@example.com',
    subject: 'Invoice #48213 charged twice',
    body: 'Hello, I was charged twice for invoice 48213 (water heater flush on the 3rd). Both charges show on my card ending 2290. Can you refund the duplicate?',
    receivedMinutesAgo: 22,
  },
  {
    id: 'm04',
    channel: 'SMS',
    from: 'Unknown',
    contact: '(214) 555-0199',
    body: 'Water is pouring from the ceiling in our kitchen, think a pipe burst upstairs. We shut off the main. Address 4410 Rosewood Ln Allen. Need someone NOW',
    receivedMinutesAgo: 3,
  },
  {
    id: 'm05',
    channel: 'Email',
    from: 'Growth Leads Agency',
    contact: 'partners@growthleads.example',
    subject: 'Get 50 booked HVAC jobs per month guaranteed',
    body: 'Hi there, we help home service companies get 50+ booked jobs a month with our proven ad system. Can I get 15 minutes on your calendar this week? Limited spots available.',
    receivedMinutesAgo: 40,
  },
  {
    id: 'm06',
    channel: 'Web form',
    from: 'Tom Alvarez',
    contact: 'tom.alvarez@example.com',
    subject: 'Technician was late and left a mess',
    body: "Your tech showed up 3 hours late yesterday with no call, then left insulation all over my garage. I'm pretty disappointed, I've used you guys for years. I want someone to come clean it up and honestly a discount.",
    receivedMinutesAgo: 55,
  },
  {
    id: 'm07',
    channel: 'Email',
    from: 'Grace Kim',
    contact: 'grace.kim@example.com',
    subject: 'Reschedule Thursday appointment',
    body: 'Hi, I have a maintenance tune-up booked for Thursday morning in Plano. Something came up at work. Could we move it to Friday or early next week?',
    receivedMinutesAgo: 70,
  },
  {
    id: 'm08',
    channel: 'Missed-call transcript',
    from: 'Robert Chen',
    contact: '(972) 555-0177',
    body: "Yeah hi, I smell gas near the furnace closet. It's faint but it's there. We opened the windows. Not sure what to do, call me back.",
    receivedMinutesAgo: 2,
  },
  {
    id: 'm09',
    channel: 'Web form',
    from: 'Alicia Moreno',
    contact: 'alicia.m@example.com',
    subject: 'Tankless water heater install',
    body: "Thinking about switching to a tankless water heater. Gas line is already in the garage. What would a ballpark price be and how long does install take? House is in Allen.",
    receivedMinutesAgo: 95,
  },
  {
    id: 'm10',
    channel: 'SMS',
    from: 'Kevin Brooks',
    contact: '(469) 555-0163',
    body: 'Hey is there a way to pay my bill online? Lost the paper invoice',
    receivedMinutesAgo: 110,
  },
  {
    id: 'm11',
    channel: 'Email',
    from: 'Samantha Ortiz',
    contact: 's.ortiz@example.com',
    subject: 'Commercial maintenance contract',
    body: 'I manage three retail suites in Frisco, about 9 rooftop units in total. We are looking for a quarterly preventive maintenance contract starting next quarter. Can someone send a proposal?',
    receivedMinutesAgo: 130,
  },
  {
    id: 'm12',
    channel: 'Web form',
    from: 'Hannah Wright',
    contact: 'hannah.w@example.com',
    subject: 'AC making loud noise',
    body: "Outside AC unit started making a grinding noise this afternoon. Still cooling but the noise is getting worse. Can someone take a look this week? We're in Plano.",
    receivedMinutesAgo: 35,
  },
  {
    id: 'm13',
    channel: 'Email',
    from: 'Daniel Foster',
    contact: 'dfoster@example.com',
    subject: 'Warranty question',
    body: "You installed our furnace in 2023. The igniter just failed. Is that covered under your labor warranty or the manufacturer's? Would like to schedule a repair either way.",
    receivedMinutesAgo: 150,
  },
  {
    id: 'm14',
    channel: 'Missed-call transcript',
    from: 'Linda Park',
    contact: '(214) 555-0121',
    body: "Hi, calling about the estimate you sent for the water softener. It's a lot higher than what another company quoted. Can someone call me to go over it?",
    receivedMinutesAgo: 180,
  },
  {
    id: 'm15',
    channel: 'SMS',
    from: 'Jorge Ramirez',
    contact: '(972) 555-0108',
    body: 'Electrical panel buzzing and the breaker for the kitchen keeps tripping. Smells a little like burning plastic. McKinney.',
    receivedMinutesAgo: 9,
  },
  {
    id: 'm16',
    channel: 'Web form',
    from: 'Olivia Turner',
    contact: 'olivia.turner@example.com',
    subject: 'Leaking faucet',
    body: 'Bathroom faucet has a slow drip. Not urgent at all, whenever you have an opening in the next couple weeks.',
    receivedMinutesAgo: 240,
  },
  {
    id: 'm17',
    channel: 'Email',
    from: 'Nate Sullivan',
    contact: 'nate@example.com',
    subject: 'Thank you!',
    body: 'Just wanted to say Chris did a great job on our duct cleaning yesterday. Very professional. We will definitely use you again.',
    receivedMinutesAgo: 300,
  },
  {
    id: 'm18',
    channel: 'Web form',
    from: 'Erica Hughes',
    contact: 'erica.hughes@example.com',
    subject: 'Whole-home generator',
    body: "After last winter's outage we want a whole-home standby generator installed. 3,100 sq ft in Frisco, natural gas available. Please send pricing options and financing info.",
    receivedMinutesAgo: 75,
  },
]
