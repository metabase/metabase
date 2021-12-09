import React, { ReactNode } from "react";

interface Props {
  title: string;
  label: string;
  isOpened?: boolean;
  isCompleted?: boolean;
  children?: ReactNode;
}

const SetupStep = () => <div />;

export default SetupStep;
