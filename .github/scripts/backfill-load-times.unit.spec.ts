import {
  type Artifact,
  type Commit,
  pickCommitsToMeasure,
  planBackfill,
  uberjarName,
} from "./backfill-load-times";
import { type Condition, buildRows } from "./bundle-load-stats-rows";

const commit = (over: Partial<Commit> = {}): Commit => ({
  sha: "0123456789abcdef0123456789abcdef01234567",
  date: "2026-08-20",
  subject: "Fix the thing (#123)",
  ...over,
});
const artifact = (sha: string, over: Partial<Artifact> = {}): Artifact => ({
  id: 42,
  name: uberjarName(sha),
  expired: false,
  ...over,
});

describe("pickCommitsToMeasure", () => {
  it("picks the live uberjar", () => {
    const c = commit();
    const [picked] = pickCommitsToMeasure([c], { [c.sha]: [artifact(c.sha)] });
    expect(picked).toEqual({ ...c, artifactId: 42 });
  });

  it("skips an expired uberjar", () => {
    const c = commit();
    const [picked] = pickCommitsToMeasure([c], {
      [c.sha]: [artifact(c.sha, { expired: true })],
    });
    expect(picked.artifactId).toBeNull();
  });

  it("skips a commit with no uberjar", () => {
    const c = commit();
    expect(pickCommitsToMeasure([c], {})[0].artifactId).toBeNull();
    expect(pickCommitsToMeasure([c], { [c.sha]: [] })[0].artifactId).toBeNull();
  });

  it("takes the first live one when several are listed", () => {
    const c = commit();
    const [picked] = pickCommitsToMeasure([c], {
      [c.sha]: [
        artifact(c.sha, { id: 1, expired: true }),
        artifact(c.sha, { id: 2 }),
        artifact(c.sha, { id: 3 }),
      ],
    });
    expect(picked.artifactId).toBe(2);
  });
});

describe("planBackfill", () => {
  it("measures everything when it fits", () => {
    expect(planBackfill({ count: 3, timeoutMinutes: 60, minutesPerCommit: 5 })).toEqual({
      measure: 3,
      dropped: 0,
    });
  });

  it("drops what does not fit", () => {
    expect(planBackfill({ count: 20, timeoutMinutes: 60, minutesPerCommit: 5 })).toEqual({
      measure: 12,
      dropped: 8,
    });
  });

  it("measures nothing when nothing fits or nothing was asked for", () => {
    expect(planBackfill({ count: 3, timeoutMinutes: 2, minutesPerCommit: 5 })).toEqual({
      measure: 0,
      dropped: 3,
    });
    expect(planBackfill({ count: 0, timeoutMinutes: 60 })).toEqual({ measure: 0, dropped: 0 });
  });
});

describe("buildRows", () => {
  const condition: Condition = {
    network: "fast",
    networkMbps: 40,
    latencyMs: 20,
    cpu: "slow",
    cpuThrottle: 4,
    coldMs: 1200,
    warmMs: 800,
    steadyMs: 600,
    coldSpreadPercent: 3.5,
    coldTtfbMs: 90,
    coldFirstPaintMs: 700,
    coldAppMountedMs: 1250,
    coldLargestPaintMs: 1800,
    coldPageReadyMs: 2100,
    warmPageReadyMs: 1400,
    scripts: 12,
    scriptKb: 2048,
    runs: 8,
  };

  it("truncates the sha to 12 characters and keeps the subject line only", () => {
    const [row] = buildRows([condition], {
      sha: "0123456789abcdef0123456789abcdef01234567",
      date: "2026-08-20",
      subject: "Fix the thing (#123)\n\nLong body here.",
    });
    expect(row.Commit).toBe("0123456789ab");
    expect(row.Description).toBe("Fix the thing (#123)");
    expect(row.Date).toBe("2026-08-20");
    expect(row["Cold ms"]).toBe(1200);
    expect(row.Runs).toBe(8);
  });

  it("carries the phases of the load through to the row", () => {
    const [row] = buildRows([condition], { sha: "abc", subject: "x" });

    expect(row["Cold ttfb ms"]).toBe(90);
    expect(row["Cold first paint ms"]).toBe(700);
    expect(row["Cold app mounted ms"]).toBe(1250);
    expect(row["Cold page ready ms"]).toBe(2100);
    expect(row["Warm page ready ms"]).toBe(1400);
  });

  it("dates the row today when no date is given", () => {
    const [row] = buildRows([condition], { sha: "abc", subject: "x" });
    expect(row.Date).toBe(new Date().toISOString().slice(0, 10));
  });
});
