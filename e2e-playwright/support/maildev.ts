/**
 * Per-worker maildev instances.
 *
 * THE PROBLEM. Every email helper in this package talks to ONE maildev on the
 * fixed pair of ports `1080` (web API) / `1025` (SMTP) — the WEBMAIL_CONFIG
 * literal from `e2e/support/cypress_data.js`. Upstream can hardcode that
 * because a Cypress CI job is single-worker: one spec at a time owns the
 * mailbox. We are not. CI runs `--workers=2` per shard with per-worker
 * *backends* but a SINGLE maildev container (`e2e-prepare-containers` runs once
 * per shard job, `maildev: true`), so both slot backends deliver into the same
 * mailbox and every helper reads it as if it were private.
 *
 * The helpers are written for a private mailbox in three different ways, and
 * all three break:
 *   - "the LAST stored email" / "the FIRST stored email"
 *     (`sendAlertAndVisitIt`, `sendEmailAndAssert`, `sendEmailAndGetFirst`)
 *     — a sibling's message can be either.
 *   - exact-count polls (`getInboxWithRetry(2)` in support/documents.ts) —
 *     a sibling's message makes the count never equal the expected one, and a
 *     sibling's `clearInbox` makes it never reach it.
 *   - `clearInbox()` is `DELETE /email/all` — it wipes the OTHER worker's mail
 *     mid-assertion, and `setupSMTP()` calls it in nearly every beforeEach.
 *
 * MEASURED, not theoretical. `documents-comments -g notifies` and
 * `sharing-reproductions -g "18352|49525"` run together at `--workers=2`
 * against the shared container:
 *     documents-comments  "an explicit @mention notifies that person"
 *         expect(emails).toHaveLength(1)  ->  Received length: 2
 *     documents-comments  "a new thread group notifies the owner"
 *         expect(emails).toHaveLength(1)  ->  Received length: 2
 *     sharing-reproductions  #18352 and UXW-4378 read a sibling's message body.
 * Run one at a time, all six pass.
 *
 * THE FIX. Give each slot its own maildev on its own ports, exactly as each
 * slot already gets its own backend (support/worker-backend.ts), its own
 * Snowplow collector (support/snowplow-collector.ts) and its own writable
 * warehouse database (support/writable-db.ts). The slot backend is pointed at
 * its own SMTP port by `setupSMTP`, and every helper resolves its web API
 * through `maildevWebUrl()`. Cross-talk then becomes structurally impossible
 * rather than merely unlikely, and — importantly — no assertion has to be
 * rewritten to tolerate a shared mailbox. "The last stored email" means what
 * upstream means by it again.
 *
 * WHY A CONTAINER AND NOT AN IN-PROCESS SINK. The Snowplow precedent is an
 * in-process `node:http` server, and an SMTP sink would be the same shape — but
 * the observable surface here is not one POST endpoint, it is a whole web
 * application. The helpers depend on maildev's REST API (`/email`,
 * `/email/all`, `/email/:id/html`, `/email/:id/attachment/:name`), on its
 * parsed-message JSON (`to`/`cc`/`bcc`/`envelope.to`/`attachments`), AND on its
 * Angular UI: `viewEmailPage`/`openEmailPage` (support/subscriptions.ts) do
 * `page.goto(MAILDEV_WEB_URL)`, click a message row, and read the resulting
 * `#/email/<id>` hash. Reimplementing all of that is reimplementing maildev,
 * and every divergence would be an assertion quietly testing our mock instead
 * of the product. A second copy of the same pinned image has no such risk. The
 * image is already a dependency of both CI (`maildev: true`) and local dev
 * (`e2e/test/scenarios/docker-compose.yml`), so this adds no new one.
 *
 * The rejected third option — rewriting every assertion to select mail by
 * recipient or subject — is strictly weaker: it narrows the window but does not
 * close it, because two workers legitimately send to the same address with the
 * same subject (both `documents-comments` and `onboarding-notifications` mail
 * `normal@metabase.test`), and it cannot defend against a sibling's
 * `DELETE /email/all` at all.
 *
 * GATING. Per-slot instances are used only when `PW_PER_WORKER_BACKEND` is set
 * — the same switch that partitions backends, collectors and warehouse
 * databases. With it off, `maildevWebUrl()` is `http://localhost:1080` and
 * `maildevSmtpPort()` is `1025`, `ensureMaildev()` starts nothing, and
 * behaviour is byte-for-byte unchanged. `PW_SLOT_OFFSET` is honoured
 * identically, so concurrent INVOCATIONS get distinct mailboxes too.
 *
 * ALWAYS resolve through `maildevWebUrl()` / `maildevSmtpPort()` — never
 * hardcode 1080/1025 in a helper again. A helper still pointed at the shared
 * container is exactly the silent-wrong-mailbox failure this exists to remove.
 */
import { execFileSync } from "child_process";

/** WEBMAIL_CONFIG from e2e/support/cypress_data.js — the shared container. */
const SHARED_WEB_PORT = 1080;
const SHARED_SMTP_PORT = 1025;

/**
 * Per-slot port blocks, following the established mapping (backend 4100+slot,
 * nrepl 4600+slot, snowplow collector 5100+slot). 6100/6200 were verified free
 * on the dev box and collide with nothing in the ports assumed by the suite —
 * in particular not the shared maildev (1080/1025) or `maildev-ssl`
 * (1081/465), which the custom-SMTP specs still use as-is.
 */
const SLOT_WEB_PORT_BASE = 6100;
const SLOT_SMTP_PORT_BASE = 6200;

/**
 * Pinned to match `e2e/test/scenarios/docker-compose.yml`. That pin is
 * load-bearing there ("the unpinned `latest` tag moved to 3.0.0-rc.1, which
 * breaks the SSL/SMTP setup"), and a per-slot instance running a DIFFERENT
 * maildev from the shared one would be a silent behavioural fork.
 */
const MAILDEV_IMAGE = "maildev/maildev:2.2.1";

const CONTAINER_PREFIX = "mb-pw-maildev-slot-";

/**
 * This process's slot, or `null` when per-worker isolation is off.
 *
 * Playwright sets `TEST_PARALLEL_INDEX` in each worker process before it loads
 * any test file, so this is readable from module scope in a support file.
 * parallelIndex, not workerIndex: a replacement worker lands on the same slot
 * and must inherit the same mailbox, exactly as it inherits the same backend.
 */
export function maildevSlot(): number | null {
  if (!process.env.PW_PER_WORKER_BACKEND) {
    return null;
  }
  return (
    Number(process.env.TEST_PARALLEL_INDEX || 0) +
    Number(process.env.PW_SLOT_OFFSET || 0)
  );
}

/** The maildev web API/UI origin THIS worker owns. */
export function maildevWebUrl(): string {
  const slot = maildevSlot();
  const port = slot === null ? SHARED_WEB_PORT : SLOT_WEB_PORT_BASE + slot;
  return `http://localhost:${port}`;
}

/** The SMTP port THIS worker's backend must be configured to deliver to. */
export function maildevSmtpPort(): number {
  const slot = maildevSlot();
  return slot === null ? SHARED_SMTP_PORT : SLOT_SMTP_PORT_BASE + slot;
}

/** Human-readable endpoint pair, for the per-worker log line. */
export function maildevEndpoint(): string {
  return `${maildevWebUrl()} (SMTP :${maildevSmtpPort()})`;
}

function containerName(slot: number) {
  return `${CONTAINER_PREFIX}${slot}`;
}

function docker(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function webApiAnswers(url: string, timeoutMs: number) {
  try {
    const response = await fetch(`${url}/email`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The container-start attempt, memoised per worker process: the first caller
 * does the docker work, everyone else awaits the same promise.
 *
 * ONLY the start is memoised, not the reachability answer. `isMaildevRunning()`
 * is a live probe upstream and must stay one — a cached `true` would keep the
 * email specs running against a mailbox that has since gone away, which is the
 * "green run that never really executed" shape.
 */
let startAttempt: Promise<void> | undefined;

async function startSlotMaildev(slot: number) {
  const url = maildevWebUrl();
  if (await webApiAnswers(url, 2_000)) {
    return; // already up on this slot (e.g. inherited by a replacement worker)
  }

  const name = containerName(slot);
  try {
    // A container from a previous invocation on this slot may exist but be
    // stopped (`--rm` only reaps it if it exited cleanly). Remove and recreate
    // rather than reusing: a stale one may hold stale mail, and `setupSMTP`'s
    // clear only runs once a spec gets that far.
    try {
      docker(["rm", "-f", name]);
    } catch {
      // no such container
    }
    docker([
      "run",
      "-d",
      "--rm",
      "--name",
      name,
      "-p",
      `${SLOT_WEB_PORT_BASE + slot}:1080`,
      "-p",
      `${SLOT_SMTP_PORT_BASE + slot}:1025`,
      MAILDEV_IMAGE,
    ]);
  } catch (error) {
    console.warn(
      `[maildev slot ${slot}] could not start ${name} on ${url}: ${error}. ` +
        "Email specs will skip. Deliberately NOT falling back to the shared " +
        "container on :1080 — that is the cross-talk this module exists to remove.",
    );
    return;
  }

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await webApiAnswers(url, 2_000)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.warn(
    `[maildev slot ${slot}] ${name} started but ${url} never answered in 60s.`,
  );
}

/**
 * Bring up this worker's maildev if it isn't already up, then report whether a
 * mailbox is reachable.
 *
 * With isolation OFF this is exactly the probe `isMaildevRunning()` has always
 * been — it never starts anything, so a run without `PW_PER_WORKER_BACKEND`
 * behaves as before.
 *
 * It returns false rather than throwing when the mailbox can't be brought up:
 * an environment with no docker has no maildev at all (the shared container is
 * one too), and the email specs' existing contract is to skip in that case. The
 * start path logs loudly so "skipped" is never mistaken for "passed".
 */
export async function ensureMaildev(): Promise<boolean> {
  const slot = maildevSlot();
  if (slot !== null) {
    startAttempt ??= startSlotMaildev(slot);
    await startAttempt;
  }
  return webApiAnswers(maildevWebUrl(), 2_000);
}

/**
 * Remove per-slot maildev containers. Called from global teardown, and safe to
 * call when none exist or docker is absent.
 *
 * Pass the slots THIS invocation owns. Removing every container by prefix
 * reaps concurrent invocations' mailboxes too — the same cross-talk that the
 * unscoped backend-port kill in global-teardown.ts caused, which produced
 * spurious SIGTERM/"Target page closed" failures across several concurrent
 * runs. Omitting `slots` keeps the old remove-everything behaviour, which is
 * correct only when you know nothing else is running.
 */
export function removeSlotMaildevContainers(slots?: number[]) {
  try {
    const ids = docker(
      slots
        ? ["ps", "-aq", ...slots.flatMap((s) => ["--filter", `name=^${containerName(s)}$`])]
        : ["ps", "-aq", "--filter", `name=^${CONTAINER_PREFIX}`],
    )
      .split("\n")
      .filter(Boolean);
    if (ids.length > 0) {
      docker(["rm", "-f", ...ids]);
    }
  } catch {
    // docker unavailable, or nothing to remove
  }
}
