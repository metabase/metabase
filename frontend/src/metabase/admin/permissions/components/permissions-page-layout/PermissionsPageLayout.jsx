/* eslint-disable react/prop-types */
import React from "react";
import { Flex } from "grid-styled";
import { PermissionsEditBar } from "./PermissionsEditBar";
import { PermissionsTabs } from "./PermissionsTabs";

export function PermissionsPageLayout({ children, tab, onChangeTab }) {
  return (
    <Flex flexDirection="column">
      <PermissionsEditBar />
      <div className="border-bottom">
        <PermissionsTabs tab={tab} onChangeTab={onChangeTab} />
      </div>
      <Flex>{children}</Flex>
    </Flex>
  );
}
