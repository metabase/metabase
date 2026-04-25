import { createMockMetabotUsage } from "metabase-types/api/mocks/metabot";

import { computeUsageScopes } from "./use-metabot-usage";

describe("computeUsageScopes", () => {
  it("returns all nulls when usage is null", () => {
    const result = computeUsageScopes(null);
    expect(result).toEqual({
      user: null,
      pool: null,
      mostConstrained: null,
      limitUnit: null,
      resetRate: null,
    });
  });

  it("returns all nulls when usage is undefined", () => {
    const result = computeUsageScopes(undefined);
    expect(result).toEqual({
      user: null,
      pool: null,
      mostConstrained: null,
      limitUnit: null,
      resetRate: null,
    });
  });

  it("returns null scopes when no limits are configured", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({
        user_usage: 50,
        user_limit: null,
        instance_usage: 200,
        instance_limit: null,
      }),
    );
    expect(result.user).toBeNull();
    expect(result.pool).toBeNull();
    expect(result.mostConstrained).toBeNull();
    expect(result.limitUnit).toBe("tokens");
    expect(result.resetRate).toBe("monthly");
  });

  it("computes user scope when user limit is configured", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({
        user_usage: 50,
        user_limit: 100,
        instance_limit: null,
      }),
    );
    expect(result.user).toEqual({
      usage: 50,
      limit: 100,
      percent: 50,
      isNearLimit: false,
      isAtLimit: false,
    });
    expect(result.pool).toBeNull();
    expect(result.mostConstrained).toBe(result.user);
  });

  it("computes pool scope from instance when no tenant", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({
        user_limit: null,
        instance_usage: 300,
        instance_limit: 500,
      }),
    );
    expect(result.user).toBeNull();
    expect(result.pool).toEqual({
      usage: 300,
      limit: 500,
      percent: 60,
      isNearLimit: false,
      isAtLimit: false,
      scope: "instance",
    });
    expect(result.mostConstrained).toBe(result.pool);
  });

  it("computes pool scope from tenant when tenant is present", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({
        user_limit: null,
        instance_usage: 300,
        instance_limit: 500,
        tenant_usage: 80,
        tenant_limit: 100,
      }),
    );
    expect(result.pool).toEqual({
      usage: 80,
      limit: 100,
      percent: 80,
      isNearLimit: true,
      isAtLimit: false,
      scope: "tenant",
    });
  });

  it("picks user as mostConstrained when user is closer to limit", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({
        user_usage: 90,
        user_limit: 100,
        instance_usage: 100,
        instance_limit: 500,
      }),
    );
    expect(result.mostConstrained).toBe(result.user);
  });

  it("picks pool as mostConstrained when pool is closer to limit", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({
        user_usage: 10,
        user_limit: 100,
        instance_usage: 450,
        instance_limit: 500,
      }),
    );
    expect(result.mostConstrained).toBe(result.pool);
  });

  it("detects near-limit at 80%", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({
        user_usage: 80,
        user_limit: 100,
      }),
    );
    expect(result.user?.isNearLimit).toBe(true);
    expect(result.user?.isAtLimit).toBe(false);
  });

  it("detects at-limit at 100%", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({
        user_usage: 100,
        user_limit: 100,
      }),
    );
    expect(result.user?.isAtLimit).toBe(true);
  });

  it("caps percent at 100 when usage exceeds limit", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({
        user_usage: 150,
        user_limit: 100,
      }),
    );
    expect(result.user?.percent).toBe(100);
    expect(result.user?.isAtLimit).toBe(true);
  });

  it("handles zero limit gracefully", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({
        user_usage: 0,
        user_limit: 0,
      }),
    );
    expect(result.user?.percent).toBe(100);
    expect(result.user?.isAtLimit).toBe(true);
  });

  it("returns messages as limitUnit when configured", () => {
    const result = computeUsageScopes(
      createMockMetabotUsage({ limit_unit: "messages" }),
    );
    expect(result.limitUnit).toBe("messages");
  });
});
