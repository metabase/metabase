import { test as base, BrowserContext, APIRequestContext } from "@playwright/test";

import { MetabaseApi } from "./api";
import {
  resetWritableDb,
  writableDialectFor,
} from "./reset-writable-db";
import { BASE_URL } from "./env";
import { LOGIN_CACHE, USERS, UserName } from "./sample-data";
import type { SnowplowCollector } from "./snowplow-collector";
import { startWorkerBackend } from "./worker-backend";

/**
 * Port of the Cypress auth model (e2e/support/commands/user/authentication.ts):
 * session ids cached at snapshot-creation time are injected as cookies, so no
 * login request is needed. API requests run as the current user, mirroring
 * cy.request's cookie-sharing behavior.
 */
class MetabaseHarness {
  readonly api: MetabaseApi;
  /** The backend this test actually targets (per-worker port when enabled). */
  readonly baseUrl: string;
  private sessionId: string | undefined;

  constructor(
    private context: BrowserContext,
    request: APIRequestContext,
    private sampleDbUrl?: string,
    baseUrl: string = BASE_URL,
    private collector?: SnowplowCollector,
  ) {
    this.api = new MetabaseApi(request, () => this.sessionId);
    this.baseUrl = baseUrl;
  }

  /**
   * This worker's private Snowplow collector — the seam for **backend-emitted**
   * events, which leave the JVM directly and are invisible to `page.route`.
   * Frontend-emitted events are still captured at the browser boundary by
   * `installSnowplowCapture` (support/search-snowplow.ts); the two coexist.
   *
   * Throws rather than skipping when there is no collector (i.e. running
   * against the shared BASE_URL backend without PW_PER_WORKER_BACKEND). A spec
   * that silently no-ops when its observation seam is missing is the FINDINGS
   * #49 "green run that never executed" shape. CI always sets
   * PW_PER_WORKER_BACKEND=1 (.github/workflows/e2e-playwright.yml:136).
   */
  get snowplow(): SnowplowCollector {
    if (!this.collector) {
      throw new Error(
        "No per-slot Snowplow collector: backend-emitted snowplow events can " +
          "only be observed with PW_PER_WORKER_BACKEND=1, which boots each slot " +
          "backend pointed at its own collector.",
      );
    }
    return this.collector;
  }

  async signIn(user: UserName = "admin") {
    const cached = LOGIN_CACHE[user];
    if (cached) {
      this.sessionId = cached.sessionId;
      await this.setSessionCookies(cached.sessionId, cached.deviceId);
      return;
    }

    // Fallback for users without a cached session.
    const { email: username, password } = USERS[user];
    const response = await this.api.post("/api/session", {
      username,
      password,
    });
    const { id } = (await response.json()) as { id: string };
    this.sessionId = id;
    await this.setSessionCookies(id, "my-device-id");
  }

  signInAsAdmin() {
    return this.signIn("admin");
  }

  signInAsNormalUser() {
    return this.signIn("normal");
  }

  signInAsSandboxedUser() {
    return this.signIn("sandboxed");
  }

  async signOut() {
    this.sessionId = undefined;
    await this.context.clearCookies({ name: "metabase.SESSION" });
  }

  async restore(name = "default") {
    // Upstream's restore() resets the warehouse first whenever the snapshot is
    // a "-writable" one (e2e-setup-helpers.js:44-49). That was never ported, so
    // warehouse state accumulated forever on a long-lived container while the
    // app DB was reset each time — 9 CI failures with "403 A table with that
    // name already exists", ~30 debris schemas, and one spec that could not
    // pass at all (FINDINGS #157). Order matters: reset BEFORE the snapshot.
    if (name.includes("-writable")) {
      await resetWritableDb({ type: writableDialectFor(name) });
    }
    await this.api.restore(name);
    // The restore triggers an async search-index rebuild. A frontend search
    // fired inside that window renders a permanent empty state (the FE never
    // re-queries), so block until the index answers before the test starts.
    const adminSession = LOGIN_CACHE.admin?.sessionId;
    if (adminSession) {
      const adminApi = new MetabaseApi(
        this.api.requestContext,
        () => adminSession,
      );
      const deadline = Date.now() + 30_000;
      let forcedReindex = false;
      while (Date.now() < deadline) {
        // Query a TABLE specifically: the rebuild indexes models in phases,
        // and cards can be searchable while tables still aren't (which broke
        // the join mini-picker after the card-based poll passed).
        const response = await adminApi.get(
          "/api/search?q=Reviews&models=table&limit=1",
          { failOnStatusCode: false },
        );
        if (response.ok()) {
          const body = await response.json().catch(() => ({ data: [] }));
          if ((body.data ?? []).length > 0) {
            break;
          }
        }
        if (!forcedReindex) {
          // Back-to-back restores can drop the rebuild trigger entirely,
          // leaving the index dead until something re-triggers it — do so.
          forcedReindex = true;
          await adminApi.post("/api/search/force-reindex", undefined, {
            failOnStatusCode: false,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (this.sampleDbUrl) {
      // Snapshots pin database 1 to the shared e2e/tmp H2 file, which only
      // one JVM can hold — re-point it at this worker's private copy. Uses
      // the cached admin session (valid post-restore) since restore usually
      // runs before signIn.
      const adminApi = new MetabaseApi(
        this.api.requestContext,
        () => LOGIN_CACHE.admin?.sessionId,
      );
      await adminApi.put("/api/database/1", {
        details: { db: this.sampleDbUrl },
      });
    }
  }

  private async setSessionCookies(sessionId: string, deviceId: string) {
    const { hostname } = new URL(BASE_URL);
    const cookie = { domain: hostname, path: "/" };
    await this.context.addCookies([
      { name: "metabase.SESSION", value: sessionId, httpOnly: true, ...cookie },
      { name: "metabase.TIMEOUT", value: "alive", ...cookie },
      { name: "metabase.DEVICE", value: deviceId, httpOnly: true, ...cookie },
    ]);
  }
}

type Fixtures = {
  mb: MetabaseHarness;
};

type WorkerFixtures = {
  workerBackend: {
    url: string;
    sampleDbUrl?: string;
    snowplow?: SnowplowCollector;
  };
};

export const test = base.extend<Fixtures, WorkerFixtures>({
  // Per-worker backend experiment (PW_PER_WORKER_BACKEND=1): each worker
  // boots its own Metabase so restore() calls can't collide across workers.
  // Off by default — everything runs against the shared BASE_URL backend.
  workerBackend: [
    async ({}, use, workerInfo) => {
      if (!process.env.PW_PER_WORKER_BACKEND) {
        await use({ url: BASE_URL });
        return;
      }
      // Static import above, NOT a dynamic `await import()`: node without
      // native TS support can't load a raw .ts dynamically at runtime
      // (CI failed with "Cannot use import statement outside a module"),
      // while the static form goes through Playwright's transpiler.
      // parallelIndex, not workerIndex: replacement workers land on the same
      // slot and reuse the still-running backend instead of booting another.
      // PW_SLOT_OFFSET partitions slots between concurrent INVOCATIONS
      // (e.g. porting agents each verifying their own spec on their own
      // backend): slot = parallelIndex + offset.
      const backend = await startWorkerBackend(
        workerInfo.parallelIndex + Number(process.env.PW_SLOT_OFFSET || 0),
      );
      console.log(
        `[worker ${workerInfo.workerIndex} slot ${workerInfo.parallelIndex}] backend on :${backend.port} ${
          backend.startupMs === 0
            ? "(reused)"
            : `ready in ${Math.round(backend.startupMs / 1000)}s`
        }`,
      );
      // Deliberately not stopped here — global teardown kills slot backends,
      // so a replacement worker on this slot can pick the backend up warm.
      await use({
        url: `http://localhost:${backend.port}`,
        sampleDbUrl: backend.sampleDbUrl,
        snowplow: backend.snowplow,
      });
      // The collector, unlike the backend, IS stopped: it lives in this node
      // process, so a replacement worker cannot inherit it and would fail to
      // bind the port. A crashed worker releases the port with the process.
      await backend.snowplow.stop();
    },
    { scope: "worker", timeout: 11 * 60_000 },
  ],

  baseURL: async ({ workerBackend }, use) => {
    await use(workerBackend.url);
  },

  mb: async ({ context, request, workerBackend }, use) => {
    await use(
      new MetabaseHarness(
        context,
        request,
        workerBackend.sampleDbUrl,
        workerBackend.url,
        workerBackend.snowplow,
      ),
    );
  },
});

export { expect } from "@playwright/test";
