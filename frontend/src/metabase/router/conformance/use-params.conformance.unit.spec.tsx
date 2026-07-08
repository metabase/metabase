import type { RouterApi } from "./test-utils";
import { runBoth } from "./test-utils";

function ParamsProbe({ api }: { api: RouterApi }) {
  const params = api.useParams();
  return (
    <div>
      <span data-testid="rr-segmentId">{params.segmentId}</span>
      <span data-testid="rr-fieldId">{params.fieldId}</span>
      <span data-testid="rr-id">{params.id}</span>
      <span data-testid="rr-splat">{params["*"]}</span>
      <span data-testid="rr-has-splat-key">{String("splat" in params)}</span>
    </div>
  );
}

describe("router/useParams conformance", () => {
  it("matches v7 for params matched by the route", async () => {
    const path = "reference/segments/:segmentId/fields/:fieldId";
    const { facade, v7 } = await runBoth(ParamsProbe, {
      initialRoute: "/reference/segments/42/fields/7",
      facadePath: path,
      v7Path: path,
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-segmentId"]).toBe("42");
    expect(facade["rr-fieldId"]).toBe("7");
  });

  it("matches v7 when decoding a URI-encoded segment", async () => {
    const { facade, v7 } = await runBoth(ParamsProbe, {
      initialRoute: "/x/a%20b",
      facadePath: "x/:id",
      v7Path: "x/:id",
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-id"]).toBe("a b");
  });

  it("matches v7 by exposing the splat under the `*` key", async () => {
    const { facade, v7 } = await runBoth(ParamsProbe, {
      initialRoute: "/files/a/b",
      facadePath: "files/**",
      v7Path: "files/*",
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-splat"]).toBe("a/b");
    expect(facade["rr-has-splat-key"]).toBe("false");
  });
});
