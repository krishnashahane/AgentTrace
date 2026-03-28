# 🔮 agenttrace

### See exactly what your AI agent is thinking, doing, and breaking.

**agenttrace** is an open-source observability platform for AI agents. It captures every LLM call, tool execution, decision branch, and error in your agent's workflow — then visualizes the entire execution as an interactive trace. Think Chrome DevTools, but for AI agents.

Built entirely with Claude Code (Opus 4.6). Zero human-written code.

---

## The Problem

Your AI agent is a black box.

It calls an LLM, decides to use a tool, gets a result, calls the LLM again, tries another tool, fails, retries, eventually returns something. You have no idea:

- Why did it choose that tool?
- What was the full prompt at each step?
- Where did it spend 80% of the time?
- Why did it loop 7 times before succeeding?
- Which step burned $0.50 in a single call?
- What went wrong when it returned garbage?

**agenttrace makes the invisible visible.**

---

## What It Looks Like

```
🔮 agenttrace — Agent Run #4821

  ┌─ 🧠 LLM Call (claude-sonnet) ·····················  1.2s  $0.003
  │   Prompt: "User wants to book a flight to Tokyo..."
  │   Decision: Use search_flights tool
  │
  ├─ 🔧 Tool: search_flights ·························  2.4s
  │   Input: {destination: "NRT", date: "2026-04-15"}
  │   Output: 12 results found
  │   Status: ✅ Success
  │
  ├─ 🧠 LLM Call (claude-sonnet) ·····················  0.9s  $0.002
  │   Prompt: "Found 12 flights. Pick best options..."
  │   Decision: Use get_flight_details tool (×3)
  │
  ├─ 🔧 Tool: get_flight_details ·····················  0.8s
  │   ├─ Flight NH203: ✅ $890
  │   ├─ Flight JL004: ✅ $1,120
  │   └─ Flight UA873: 🔴 TIMEOUT (retry 1/3)
  │       └─ 🔧 Retry ································  0.9s
  │           └─ UA873: ✅ $945
  │
  ├─ 🧠 LLM Call (claude-sonnet) ·····················  0.7s  $0.001
  │   Decision: Format and present top 3 options
  │
  └─ ✅ Response returned ····························  Total: 6.9s  $0.006
      Tokens: 3,847 in / 1,203 out
      Tools: 4 calls (1 retry)
      Cost: $0.006
```

---

## Features

- 🔍 **Full Trace Visualization** — See every step your agent takes as an interactive tree. Expand any node to see full prompts, responses, and tool I/O.
- ⏱️ **Performance Profiling** — Latency breakdown per step. Find bottlenecks instantly. Which LLM call is slow? Which tool is timing out?
- 💰 **Cost Attribution** — Per-step cost tracking. Know exactly which part of your agent pipeline burns the most money.
- 🔴 **Error Tracking** — Tool failures, retries, hallucinations, and infinite loops — all captured with full context.
- 📊 **Analytics Dashboard** — Aggregate metrics across hundreds of agent runs. Success rates, average latency, cost trends, error hotspots.
- 🔄 **Replay Mode** — Replay any agent run step-by-step. Debug issues without re-running.
- 🏷️ **Tagging & Filtering** — Tag runs by user, feature, or experiment. Filter traces to find patterns.
- 🔔 **Alerts** — Alert on high cost, high latency, high error rate, or specific failure patterns.
- 🧩 **Framework Support** — Works with LangChain, LlamaIndex, CrewAI, AutoGen, Mastra, or any custom agent.

---

## Quick Start

### Node.js / TypeScript

```bash
npm install agenttrace
```

```typescript
import { trace } from 'agenttrace';

// Wrap your AI calls — that's it
const result = await trace.llm('claude-sonnet', {
  messages: [{ role: 'user', content: 'Book a flight to Tokyo' }]
});

const toolResult = await trace.tool('search_flights', {
  destination: 'NRT',
  date: '2026-04-15'
});

// Or wrap an entire agent run
const run = trace.startRun('flight-booking');
// ... your agent logic ...
run.end();

// View traces at http://localhost:4050
```

### Python

```bash
pip install agenttrace
```

```python
from agenttrace import trace

# Decorator-based tracing
@trace.agent("flight-booking")
def book_flight(destination):
    result = trace.llm("claude-sonnet", messages=[...])
    flights = trace.tool("search_flights", input={...})
    return format_results(flights)
```

### LangChain Integration

```typescript
import { AgentTraceCallback } from 'agenttrace/langchain';

const agent = new AgentExecutor({
  callbacks: [new AgentTraceCallback()]
});
```

### Auto-Instrument (Zero Code)

```bash
# Automatically traces all OpenAI/Anthropic API calls
agenttrace auto --port 4050

# Set your API base URLs to the proxy
OPENAI_BASE_URL=http://localhost:4050/openai/v1
ANTHROPIC_BASE_URL=http://localhost:4050/anthropic/v1
```

---

## Dashboard

```bash
# Start the trace viewer
agenttrace dashboard

# → http://localhost:4050
```

The dashboard shows:

- **Trace List** — All agent runs with status, duration, cost, and token usage
- **Trace Detail** — Interactive tree view of every step
- **Analytics** — Aggregate charts for latency, cost, error rates over time
- **Comparison** — Compare two agent runs side-by-side (great for A/B testing prompts)
- **Alerts** — Configure thresholds for cost, latency, and error rates

---

## Architecture

```
agenttrace/
├── sdk/
│   ├── node/
│   │   ├── trace.ts            # Core tracing API
│   │   ├── llm.ts              # LLM call instrumentation
│   │   ├── tool.ts             # Tool call instrumentation
│   │   ├── auto.ts             # Auto-instrumentation (proxy)
│   │   └── integrations/
│   │       ├── langchain.ts    # LangChain callback handler
│   │       ├── llamaindex.ts   # LlamaIndex callback handler
│   │       ├── crewai.ts       # CrewAI integration
│   │       └── mastra.ts       # Mastra integration
│   └── python/
│       ├── trace.py            # Core tracing API
│       ├── decorators.py       # @trace decorators
│       └── integrations/       # Framework integrations
├── collector/
│   ├── server.ts               # Trace collection server
│   ├── processor.ts            # Trace processing pipeline
│   ├── storage.ts              # SQLite/PostgreSQL storage
│   └── exporter.ts             # OpenTelemetry export
├── dashboard/
│   ├── app/                    # Next.js dashboard
│   ├── components/
│   │   ├── TraceTree.tsx       # Interactive trace visualization
│   │   ├── TraceTimeline.tsx   # Gantt-chart style timeline
│   │   ├── CostBreakdown.tsx   # Per-step cost attribution
│   │   ├── ErrorPanel.tsx      # Error details + stack traces
│   │   ├── Analytics.tsx       # Aggregate charts
│   │   └── Comparison.tsx      # Side-by-side trace comparison
│   └── lib/
│       └── ws-client.ts        # Real-time trace streaming
├── proxy/
│   ├── openai.ts               # OpenAI proxy interceptor
│   ├── anthropic.ts            # Anthropic proxy interceptor
│   └── generic.ts              # Generic HTTP interceptor
└── cli/
    ├── dashboard.ts            # Start dashboard
    ├── auto.ts                 # Auto-instrument mode
    └── export.ts               # Export traces
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| SDKs | TypeScript, Python |
| Collector | Node.js, WebSocket |
| Storage | SQLite (local), PostgreSQL (production) |
| Dashboard | Next.js 14, D3.js (trace trees), Recharts |
| Proxy | HTTP interception for auto-instrumentation |
| Export | OpenTelemetry-compatible format |
| Real-time | WebSocket for live trace streaming |

---

## Comparison

| Feature | agenttrace | LangSmith | Helicone | Braintrust |
|---------|:----------:|:---------:|:--------:|:----------:|
| Open source | ✅ | ❌ | Partial | ❌ |
| Self-hosted | ✅ | ❌ | ✅ | ❌ |
| Agent traces (tree) | ✅ | ✅ | ❌ | ✅ |
| Auto-instrument | ✅ | ❌ | ✅ | ❌ |
| Cost attribution | ✅ | ✅ | ✅ | ✅ |
| Framework agnostic | ✅ | ❌ | ✅ | ❌ |
| Free | ✅ | Freemium | Freemium | Freemium |
| Local-first | ✅ | ❌ | ❌ | ❌ |

---

## Roadmap

- [x] Node.js + Python SDKs
- [x] Interactive trace tree visualization
- [x] Cost + latency per step
- [x] Auto-instrumentation proxy
- [x] LangChain integration
- [ ] LlamaIndex, CrewAI, Mastra integrations
- [ ] Trace comparison (A/B testing)
- [ ] OpenTelemetry export
- [ ] Prometheus metrics endpoint
- [ ] Hosted cloud version
- [ ] GitHub Action (trace in CI)
- [ ] Anomaly detection (alert on unusual agent behavior)
- [ ] Replay mode with editable prompts

---

## Contributing

Apache 2.0 licensed. PRs welcome.

```bash
npm run dev:sdk         # SDK development
npm run dev:dashboard   # Dashboard development
npm run test            # Test suite
```

Developed by [@krishnashahane](https://github.com/krishnashahane)
