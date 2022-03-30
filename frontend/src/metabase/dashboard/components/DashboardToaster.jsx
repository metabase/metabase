import React from "react";
import styled from "@emotion/styled";
// import {css} from '@emotion/react';
import Toaster from "metabase/dashboard/components/Toaster";

const DashbaordToasterContainer = styled.div`
  position: absolute;
  bottom: 16px;
  left: 24px;
`;

const DashboardToaster = props => {
  return (
    <DashbaordToasterContainer>
      <Toaster {...props} />
    </DashbaordToasterContainer>
  );
};

export default DashboardToaster;
