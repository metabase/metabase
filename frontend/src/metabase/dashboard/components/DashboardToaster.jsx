import React from "react";
import styled from "@emotion/styled";
import Toaster from "metabase/components/Toaster";

const DashbaordToasterContainer = styled.div`
  position: absolute;
  bottom: 16px;
  left: 24px;
  z-index: 1000;
`;

const DashboardToaster = props => {
  return (
    <DashbaordToasterContainer>
      <Toaster {...props} />
    </DashbaordToasterContainer>
  );
};

export default DashboardToaster;
