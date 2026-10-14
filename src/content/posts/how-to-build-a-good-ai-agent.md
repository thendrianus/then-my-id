---
title: How to Build a Good AI Agent
summary: A mental model for building AI agents. The model is rarely the problem. Reliability comes from the system around it, so start simple and add structure only when a real failure asks for it.
date: 2026-10-14
format: article
categories: [technology, work]
tags: [ai agents, harness, context, evals]
backsound: calm
---

## Where this comes from

This note pulls together several engineering articles from Anthropic about building agents. They are listed at the end. Read together, they make one point. When an agent fails, the model is rarely the main cause. The system around the model usually is.

There are six principles here. I will go through them in order, then finish with a quick way to diagnose a struggling agent.

## Start simple

The first principle is to use the least complicated design that works. One model call with good tools often beats an elaborate setup with many agents.

There are two shapes to choose from. In a workflow, your code decides the steps. In an agent, the model decides its own next step. Workflows are cheaper and more predictable. Agents are more flexible, but they cost more and can compound their own mistakes.

So use an agent only when you cannot predict the steps in advance, but you can still check progress. Summarizing a document and then translating it is a workflow. Fixing a bug in a codebase is an agent task, because nobody knows the steps upfront.

## Give it a good environment

The second principle is about the harness. That is everything around the model: its tools, its permissions, its memory, and the sandbox where it runs code.

Many agent failures are really environment failures. If an agent keeps failing to run tests because it has no test tool, rewriting the prompt will not help. Adding the tool will.

Two rules matter most. Keep tools few, clear, and not overlapping. And keep secrets, like keys and tokens, out of reach of any code the model writes, so that a prompt injection attack cannot steal them.

## Manage context deliberately

The third principle is that the model can only attend to what is in its context window, and more information is not always better. Too much noise makes it worse. Aim for the smallest set of high-signal information.

There are four useful techniques. The first is loading details just in time. Keep pointers, like file paths, and fetch the content only when it is needed. The second is summarizing long histories. The third is letting the agent write notes to a file outside the window and read them back later. And the fourth is using sub-agents, which start fresh and report back a short summary.

For example, instead of pasting a five hundred page manual into the prompt, give the agent a search tool.

## Add a feedback loop with a real check

The fourth principle is that a loop is the agent repeating act, check, and adjust until it is done. It needs a real way to verify its work, such as running tests or opening the page. Without one, it is only guessing.

It also needs stop rules. That means a maximum number of tries, a budget limit, and a way to notice when it keeps repeating the same action with no progress. A good example is "get the homepage score to ninety or above, and stop after five tries." It has a measurable goal and a hard cap.

## Separate the doer from the judge

The fifth principle is that agents tend to be too generous when they grade their own work. A separate evaluator, tuned to be skeptical, is easier to make strict.

But it costs more. In Anthropic's experiment, the full setup with a planner, a generator, and an evaluator cost about two hundred dollars, against about nine dollars for a solo run. The difference was that the solo app's main feature did not actually work. So add an evaluator only when the task is hard or subjective.

## Measure with evals, and keep trimming

The sixth principle is to test your agent. An eval gives the agent a task and then grades the result. Build evals from real failures you have seen.

Because agents are unpredictable, one success is not enough. There are two useful questions. Can it succeed at least once? And does it succeed every time? Those are called pass at k and pass hat k.

Every piece of a harness assumes the model cannot do something. As models improve, those assumptions go stale. So re-test, and remove the pieces you no longer need.

## Diagnosing by symptom

When something goes wrong, match the symptom to the layer. If the agent has missing tools or loses context, look at the harness and the context. If it repeats mistakes and never stops, look at the loop and the stop rules. If it does things in the wrong order, or its work collides, look at the workflow structure. And if you cannot tell whether it is improving, you need evals.

<table>
<thead><tr><th>Symptom</th><th>Fix</th></tr></thead>
<tbody>
<tr><td>Missing tools, lost context</td><td>Harness and context</td></tr>
<tr><td>Repeats mistakes, never stops</td><td>Loop and stop rules</td></tr>
<tr><td>Wrong order, collisions</td><td>Workflow structure</td></tr>
<tr><td>Cannot tell if it is improving</td><td>Evals</td></tr>
</tbody>
</table>

## What I want to remember

The main lesson is to resist the urge to build something clever first. Start with one call and good tools. When it fails, find out which layer failed, and fix only that layer. Then measure, so that I know whether the fix helped.

The articles behind this note are, from Anthropic: [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents); [Effective Context Engineering for AI Agents](https://anthropic.com/engineering/effective-context-engineering-for-ai-agents); [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents); [Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps); [Scaling Managed Agents](https://anthropic.com/engineering/managed-agents); [Harnessing Claude's Intelligence](https://claude.com/blog/harnessing-claudes-intelligence); [Getting Started with Loops](https://claude.com/blog/getting-started-with-loops); and [Demystifying Evals for AI Agents](https://anthropic.com/engineering/demystifying-evals-for-ai-agents).
