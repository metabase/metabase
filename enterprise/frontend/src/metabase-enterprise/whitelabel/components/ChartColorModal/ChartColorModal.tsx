import React from "react";

export interface ChartColorModalProps {
  onReset?: () => void;
  onClose?: () => void;
}

const ChartColorModal = ({ onClose }: ChartColorModalProps): JSX.Element => {
  return <div onClick={onClose} />;
};

export default ChartColorModal;
