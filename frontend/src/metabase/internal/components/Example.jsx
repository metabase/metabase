/* eslint-disable react/prop-types */
import React from "react";
import reactElementToJSXString from "react-element-to-jsx-string";

import CopyButton from "metabase/components/CopyButton";
import Label from "metabase/components/type/Label";
import Card from "metabase/components/Card";
import { ExampleContent, ExampleFooter, ExampleRoot } from "./Example.styled";

const Example = ({ children }) => {
  const code = reactElementToJSXString(children);
  return (
    <ExampleRoot>
      <Label color="medium">Example</Label>
      <Card>
        <ExampleContent>{children}</ExampleContent>
        <ExampleFooter>
          <div style={{ position: "absolute", top: "16px", right: "16px" }}>
            <CopyButton
              className="ml1 text-brand-hover cursor-pointer"
              value={code}
            />
          </div>
          <pre className="overflow-auto">
            <code>{code}</code>
          </pre>
        </ExampleFooter>
      </Card>
    </ExampleRoot>
  );
};

export default Example;
