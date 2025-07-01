import cx from "classnames";
import { useContext, useState } from "react";

import CS from "metabase/css/core/index.css";
import { Form, FormNumberInput, FormProvider } from "metabase/forms";
import { Button, Flex, Icon, Portal } from "metabase/ui";

import { DebugContext } from "./DebugContext";

export const DebugMenu = () => {
  const { simulateLoad } = useContext(DebugContext);
  const [open, setOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(true);
  if (!open) {
    return null;
  }

  return (
    <Portal>
      <div
        className={cx(CS.fixed, CS.rounded, CS.p1)}
        style={{
          top: 4,
          left: "50%",
          transform: "translateX(-50%)",
          background: "white",
          boxShadow: "0 1px 8px rgb(0 0 0 / 0.33)",
          opacity: collapsed ? 0.3 : 1,
        }}
      >
        <Flex align="center">
          <h2 className={cx(CS.h3, CS.flexGrow1)}>{"Simulate slowness"}</h2>
          <button
            style={{ display: "flex", cursor: "pointer", color: "inherit" }}
            className={CS.ml1}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name={collapsed ? "expand" : "contract"} />
          </button>
          <button
            style={{ display: "flex", cursor: "pointer", color: "inherit" }}
            className={CS.ml1}
            onClick={() => setOpen(false)}
          >
            <Icon name="close" />
          </button>
        </Flex>
        <FormProvider
          initialValues={{ min: 0, max: 0 }}
          onSubmit={(values) => simulateLoad(values.min || 0, values.max || 0)}
        >
          {() => (
            <Form>
              {!collapsed && (
                <Flex align="end" mx={-4}>
                  <div style={{ padding: "0.25rem" }}>
                    <FormNumberInput name="min" size="sm" label="min (ms)" />
                  </div>
                  <div style={{ padding: "0.25rem" }}>
                    <FormNumberInput name="max" size="sm" label="max (ms)" />
                  </div>
                  <div style={{ padding: "0.25rem" }}>
                    <Button type="submit" size="sm">
                      {"Set and trigger"}
                    </Button>
                  </div>
                </Flex>
              )}
            </Form>
          )}
        </FormProvider>
      </div>
    </Portal>
  );
};
