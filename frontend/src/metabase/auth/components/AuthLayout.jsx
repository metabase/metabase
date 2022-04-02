/* eslint-disable react/prop-types */
import React from "react";

import { Flex } from "grid-styled";
import Card from "metabase/components/Card";

import AuthScene from "../components/AuthScene";
import LogoIcon from "metabase/components/LogoIcon";

const AuthLayout = ({ children }) => (
  <Flex
    flexDirection="column"
    flex={1}
    justifyContent="center"
    alignItems="flex-end"
    className="overflow-hidden relative AuthLayout"
  >
    <Flex mt={-4} flexDirection="column" mr={280}>
      {/* <LogoIcon height={65} /> */}
      <Card p={3} mt={3} className="relative z2 bg-login" width={420}>
        {children}
      </Card>
    </Flex>
    {/* <AuthScene /> */}
  </Flex>
);

export default AuthLayout;
