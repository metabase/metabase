import rule from "../eslint-plugin-metabase/rules/bounded-route-gate";

import { createRuleTester } from "./rule-tester";

const ruleTester = createRuleTester();

const FILE = "/repo/enterprise/frontend/src/metabase-enterprise/foo/index.ts";

ruleTester.run("bounded-route-gate", rule, {
  valid: [
    {
      name: "one feature, the shape transforms-inspector uses",
      filename: FILE,
      code: `
        PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes = getInspectorUpsellRoutes;
        if (hasPremiumFeature("transforms-python")) {
          PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes = getInspectorRoutes;
        }
      `,
    },
    {
      name: "two features, the shape audit_app uses, which the sweep covers at t=2",
      filename: FILE,
      code: `
        if (hasPremiumFeature("audit_app")) {
          if (hasPremiumFeature("ai_controls")) {
            PLUGIN_AUDIT.getAiAuditingRoutes = getAiAuditingRoutes;
          } else {
            PLUGIN_AUDIT.getAiAuditingRoutes = getAiAuditingUpsellRoutes;
          }
        }
      `,
    },
    {
      name: "a slot that holds no routes is not this rule's business",
      filename: FILE,
      code: `
        if (hasPremiumFeature("a") && hasPremiumFeature("b") && hasPremiumFeature("c")) {
          PLUGIN_TRANSFORMS_PYTHON.shouldShowInspectTab = true;
        }
      `,
    },
  ],
  invalid: [
    {
      name: "three features exceeds what the sweep covers",
      filename: FILE,
      code: `
        if (hasPremiumFeature("a") && hasPremiumFeature("b")) {
          if (hasPremiumFeature("c")) {
            PLUGIN_AUDIT.getAiAuditingRoutes = getRoutes;
          }
        }
      `,
      errors: [{ messageId: "tooManyFeatures" }],
    },
    {
      name: "a non-literal feature name cannot be covered at any strength",
      filename: FILE,
      code: `
        if (hasPremiumFeature(name)) {
          PLUGIN_AUDIT.getAiAuditingRoutes = getRoutes;
        }
      `,
      errors: [{ messageId: "unreadableFeature" }],
    },
  ],
});
