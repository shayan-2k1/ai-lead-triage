# Switchboard: AI inbox triage for service businesses

**Live demo:** https://shayan-2k1.github.io/ai-lead-triage/

Home service companies get messages from web forms, email, SMS and missed-call transcripts all day. Someone has to read each one, work out whether it's an emergency, a sales lead or a billing question, and pass it to the right person. Emergencies sit in the same pile as vendor spam, and good leads wait hours for a reply.

Switchboard reads every incoming message and:

- **Sorts it** by intent (service request, quote, complaint, billing, scheduling change, feedback, vendor pitch) and shows how confident it is.
- **Flags emergencies** such as gas smells, burst pipes, burning smells from an electrical panel, or no heat with a newborn in the house, and pins them to the top with a safety script.
- **Scores sales leads** from details like system size, commercial scope, timeline and financing questions.
- **Routes it** to Dispatch, Sales, Billing or Customer care using rules the manager can reorder, switch off or point at another team.
- **Drafts a reply** that a person reviews, edits and approves. Nothing goes out automatically, and drafts with unfilled `[check]` fields can't be sent.
- **Explains itself.** Every decision lists the phrases that triggered it, so staff can see why a message was classified the way it was.
- **Reports** on message mix, team workload, how many drafts were sent without edits, and the best open leads.

## About this demo

- All customer data is fictional (Ridgeline Home Services is not a real company).
- Classification runs in the browser with a transparent rules model, so the demo works offline and nothing you type leaves the page. In a client project this step calls an LLM (OpenAI or Anthropic) behind a small API, with the same human-approval step and an audit log.
- State is kept in your browser's local storage. Use **Reset demo** to start over.

## Tech

React 19, TypeScript, Vite, Recharts, lucide icons. Built and deployed to GitHub Pages with GitHub Actions.

```bash
npm install
npm run dev
```

## What a production version adds

- Connectors for the real inbox (Gmail / Microsoft 365), SMS and call-tracking provider, and the CRM or field-service tool (ServiceTitan, Jobber, HubSpot, Dynamics 365).
- LLM classification and drafting with prompt versioning, confidence thresholds and fallback to manual triage.
- Roles and permissions, response-time alerts, and a full audit trail of who approved what.

Built by Muhammad Shayan Khan.
