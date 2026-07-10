The product file is restored to HEAD and `git diff --stat` shows only the spec file. Task complete.

## Report

**1. Test added**

File: `frontend/src/metabase/querying/parameters/utils/parsing.unit.spec.ts`

```diff
+import dayjs from "dayjs";
+import "dayjs/locale/fr";
+
 import type { DateFilterValue } from "metabase/querying/common/types";
 import type { ParameterValueOrArray } from "metabase-types/api";
@@ (end of the "date parameters" describe block)
   ])("should ignore invalid value %s", (value) => {
     expect(deserializeDateParameterValue(value)).toBeNull();
   });
+
+  it("should serialize exclude-months with English month names regardless of the active locale (metabase#29122)", () => {
+    const originalLocale = dayjs.locale();
+    try {
+      dayjs.locale("fr");
+      const value: DateFilterValue = {
+        type: "exclude",
+        operator: "!=",
+        unit: "month-of-year",
+        values: [3],
+      };
+      expect(serializeDateParameterValue(value)).toEqual("exclude-months-Mar");
+    } finally {
+      dayjs.locale(originalLocale);
+    }
+  });
 });
```

**2. Level** — Pure-function level. It calls `serializeDateParameterValue` directly (no render, no store), which is exactly where the mutated `exclude-months` serializer lives in `parsing.ts`. I added it to the existing colocated spec's `date parameters` block, mirroring the existing exclude-months round-trip cases. The locale set/restore idiom (`originalLocale` + `try/finally`) copies the sibling convention in `date.unit.spec.tsx` (issue #66658), and `import "dayjs/locale/fr"` follows the same file's locale-loading pattern.

**3. Proof**
- Clean HEAD (hardcoded `MONTHS` array): `Tests:       168 passed, 168 total` — new test PASSES.
- Semantic revert applied (`dayjs().month(monthNumber - 1).format("MMM")`): `Tests:       1 failed, 167 passed, 168 total`. The failure is a clean value assertion:
  ```
  expect(received).toEqual(expected)
  Expected: "exclude-months-Mar"
  Received: "exclude-months-mars"
  ```
  (`mars` is French for March — the locale leak.) Then un-reverted the product file to HEAD.

**4. Isolation** — Only the new test flips; all 167 sibling tests stay green under the revert. The failure is a value assertion (`toEqual` on the serialized string), not a compile/import error.

**5. Outcome** — `hole_closed`. `git diff --stat` shows only the spec file (1 changed, 19 insertions). The locale-immune jest env now has an explicit non-English-locale guard that reproduces #29122.