// Posts every Metabot finding in pa_events to Chris's papercuts server, one report per finding.
// Usage: bun send.ts [--watch]. PAPERCUTS_SERVER and PAPERCUTS_TOKEN come from the environment or .env.
import { hostname } from "node:os";
import { env, sql, FINDINGS, FP, logEvidence, sourceEvidence, links, git } from "./triage.ts";

const SERVER = (env.PAPERCUTS_SERVER || "http://127.0.0.1:8766").replace(/\/+$/, "");
const REVIEW = "ai_service_event.agent_turn_reviewed";
// Where a turn-level failure with no tool and no stack trace surfaces: provider errors, limits, aborts.
const AGENT_LOOP = "src/metabase/metabot/agent/core.clj";

// The code dev-ee runs, read once at startup: the checkout's branch and HEAD, and whether it has uncommitted changes.
const read = (...args: string[]) => git("--no-optional-locks", ...args).stdout.toString().trim();
const BRANCH = read("rev-parse", "--abbrev-ref", "HEAD").replace(/^HEAD$/, "") || undefined;
const COMMIT = read("rev-parse", "HEAD") || undefined;
const DIRTY = read("status", "--porcelain") !== "";

// Our verdict category to Chris's: the agent was misled or misbehaved is an agent-trap, a broken tool or provider
// is tooling, anything else is other.
const CATEGORY: Record<string, string> = {
  silent_tool_failure: "agent-trap", missing_data: "agent-trap", bad_tool_arguments: "agent-trap", loop: "agent-trap",
  limit_hit: "agent-trap", tool_failure: "tooling", provider_error: "tooling",
};

// Minutes lost: a failed call's own duration, or for a reviewed turn the flagged tool's calls in that turn (the
// request of the session's last tool call before the review). All-zero session ids come from unit test runs.
const QUERY = `
  select f.*, ${FP} as fp,
         case when f.event_name = '${REVIEW}' then (
           select sum((t.event_data->>'duration_ms')::numeric) from pa_events t
            where t.event_name = 'ai_service_event.agent_used_tool'
              and t.event_data->'event_details'->>'tool_name' = f.tool
              and t.event_data->>'request_id' = (
                select l.event_data->>'request_id' from pa_events l
                 where l.event_name = 'ai_service_event.agent_used_tool'
                   and l.event_data->>'session_id' = f.event_data->>'session_id' and l.created_at < f.created_at
                 order by l.created_at desc limit 1))
         else (f.event_data->>'duration_ms')::numeric end as cost_ms
    from (${FINDINGS}) f
   where f.created_at < now() - interval '5 seconds'
     and coalesce(f.event_data->>'session_id', '') !~ '^00000000-'
   order by f.id`;

// Built from the event alone, so a resend or a rebuilt pa_events gives the same id. Parallel calls that fail the
// same way in one step share it.
const reportId = ({ event_name, event_data: d, tool, error_class }: any) => {
  const at = event_name === REVIEW ? `message-${d.event_details?.message_id}` : `step-${d.event_details?.step}:${tool}:${error_class}`;
  return `metabot:${d.session_id}:${d.request_id}:${at}`;
};

async function report(f: any, id: string) {
  const { hashed_metabase_license_token, ...data } = f.event_data;
  const det = data.event_details ?? {};
  const review = f.event_name === REVIEW;
  const log = await logEvidence([f], review);
  const code = await sourceEvidence(f.tool, f.error_class, log.frames, !review);
  const quoted = log.lines.map((l) => (l.includes("Metabot turn review ") ? /"summary":("(?:[^"\\]|\\.)*")/.exec(l)?.[1] : undefined)).find(Boolean);
  const summary: string | undefined = quoted && JSON.parse(quoted);
  const linkLines = links({ tool: f.tool }, { summary }, { events: [f], ids: [String(f.id)], stamps: log.stamps, forms: code.forms });
  const ours = review ? det.category : det.agent_error ? "bad_tool_arguments" : "tool_failure";
  const tool = f.tool ? `tool \`${f.tool}\`` : "no tool";
  const title = review
    ? `Metabot turn review flags ${(f.signal ?? "a papercut").replaceAll("_", " ")}${f.tool ? ` in ${f.tool}` : ""}`
    : det.agent_error ? `Metabot's ${f.tool} tool rejects the model's arguments (${f.error_class})`
    : `Metabot's ${f.tool} tool throws ${f.error_class}`;
  const happened = review
    ? `The turn reviewer (${det.reviewed_by}${det.confidence != null ? `, confidence ${det.confidence}` : ""}) flagged message ${det.message_id} as a papercut: category \`${det.category}\`, signals \`${det.signals}\`, ${tool}.` +
      (summary ? `\n\nReviewer summary: ${summary}` : "")
    : `Metabot's \`${f.tool}\` tool failed at step ${det.step} with error class \`${f.error_class}\` after ${data.duration_ms} ms, and \`agent_used_tool\` recorded \`result = error\`.` +
      (det.agent_error ? " Metabase blamed the model's arguments (`agent_error`) and let it retry." : "");
  const toolForm = code.forms.find(({ form }) => form.text.includes(":tool-name") && form.text.includes(`"${f.tool}"`));
  return {
    repository: env.PAPERCUTS_REPOSITORY || "metabase",
    reporter: "andreis.metabot",
    agent: "metabot",
    machine: hostname(),
    session: data.session_id,
    report_id: id,
    fingerprint: `metabot:${f.fp}`,
    category: CATEGORY[ours] ?? "other",
    title,
    description: `${happened}\n\n## Links\n\n${linkLines.join("\n")}`,
    path: (toolForm ?? code.forms[0])?.file ?? AGENT_LOOP,
    area: `metabot/${f.tool ?? "agent"}`,
    cost_minutes: f.cost_ms == null ? null : +(Number(f.cost_ms) / 60_000).toFixed(4),
    observed_at: new Date(f.created_at).toISOString(),
    branch: BRANCH,
    commit_sha: COMMIT,
    // HEAD as read at startup; the server needs to know it isn't necessarily the exact commit that ran.
    commit_source: COMMIT ? "session-start" : undefined,
    source_type: review ? "metabot-turn-review" : "metabot-tool-error",
    source_ref: `${env.MB_URL ?? "http://localhost:3000"}/monitor/ai-auditing/conversations/${data.session_id}`,
    details: {
      event: { id: Number(f.id), name: f.event_name, created_at: new Date(f.created_at).toISOString(), data },
      verdict: review ? { category: det.category, signals: det.signals?.split(","), tool: f.tool, confidence: det.confidence, reviewed_by: det.reviewed_by, summary } : null,
      links: linkLines,
      triage_fingerprint: f.fp,
      dirty: DIRTY,
    },
  };
}

const done = new Set<string>();
const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

async function pass() {
  for (const f of await sql.unsafe(QUERY)) {
    const id = reportId(f);
    if (done.has(id)) continue;
    const body = await report(f, id);
    const res = await fetch(`${SERVER}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(env.PAPERCUTS_TOKEN ? { authorization: `Bearer ${env.PAPERCUTS_TOKEN}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const r: any = await res.json().catch(() => ({}));
    // 400 and 409 won't change on a retry; 401, 404 and 5xx might once the server or its settings are fixed.
    if ([200, 201, 400, 409].includes(res.status)) done.add(id);
    const p = r.papercut;
    console.log(`${now()} ${res.status} #${f.id} ${p ? `papercut ${p.id} (${p.report_count} reports)${r.created ? " new" : ""}${r.replay ? " replay" : ""}` : r.error ?? ""} ${body.fingerprint} ${body.title}`);
  }
}

if (process.argv.includes("--watch")) {
  console.log(`${now()} sending Metabot findings to ${SERVER} every 5s, code ${BRANCH}@${COMMIT?.slice(0, 11)}${DIRTY ? " (dirty)" : ""}`);
  for (;;) {
    await pass().catch((e) => console.error(`${now()} pass failed: ${e.message}`));
    await Bun.sleep(5_000);
  }
} else {
  await pass();
  await sql.close();
}
