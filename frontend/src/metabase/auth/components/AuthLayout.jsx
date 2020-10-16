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
    alignItems="center"
    className="overflow-hidden relative"
  >
    <Flex mt={-4} flexDirection="column">
      <LogoIcon height={65} />
      <Card p={3} mt={3} className="relative z2" w={420}>
        {children}
      </Card>
    </Flex>
    <AuthScene />
  </Flex>
);

export default AuthLayout;
