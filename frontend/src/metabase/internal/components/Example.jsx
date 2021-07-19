/* eslint-disable react/prop-types */
import React from "react";
import { Box } from "grid-styled";
import reactElementToJSXString from "react-element-to-jsx-string";

import CopyButton from "metabase/components/CopyButton";
import { Absolute } from "metabase/components/Position";
import Label from "metabase/components/type/Label";
import Card from "metabase/components/Card";

const Example = ({ children }) => {
  const code = reactElementToJSXString(children);
  return (
    <Box my={3} w="100%">
      <Label color="medium">Example</Label>
      <Card>
        <Box p={2} className="border-bottom">
          {children}
        </Box>
        <Box p={2} className="relative">
          <Absolute top={16} right={16}>
            <CopyButton
              className="ml1 text-brand-hover cursor-pointer"
              value={code}
            />
          </Absolute>
          <pre className="overflow-auto">
            <code>{code}</code>
          </pre>
        </Box>
      </Card>
    </Box>
  );
};

export default Example;
