import type { ReactNode } from "react";

import {
  LoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/common/components/LoadingAndErrorWrapper";
import {
  TextArea,
  type TextAreaProps,
} from "metabase/common/components/TextArea";
import { Box, type BoxProps } from "metabase/ui";

import S from "./ValuesSourceTypeModal.module.css";

interface BoxPropsWithChildren extends BoxProps {
  children?: ReactNode;
}

export const ModalBodyWithPane = (props: BoxPropsWithChildren) => {
  return <Box className={S.ModalBodyWithPane} {...props} />;
};

export const ModalPane = (props: BoxPropsWithChildren) => {
  return <Box className={S.ModalPane} {...props} />;
};

export const ModalMain = (props: BoxPropsWithChildren) => {
  return <Box className={S.ModalMain} {...props} />;
};

export const ModalSection = (props: BoxPropsWithChildren) => {
  return <Box mb="md" {...props} />;
};

export const ModalLabel = (props: BoxPropsWithChildren) => {
  return <Box component="label" className={S.ModalLabel} {...props} />;
};

export const ModalTextArea = (props: TextAreaProps) => {
  return <TextArea className={S.ModalTextArea} {...props} />;
};

export const ModalHelpMessage = (props: BoxPropsWithChildren) => {
  return <Box className={S.ModalHelpMessage} {...props} />;
};

export const ModalErrorMessage = (props: BoxPropsWithChildren) => {
  return <Box className={S.ModalErrorMessage} {...props} />;
};

export const ModalEmptyState = (props: BoxPropsWithChildren) => {
  return <Box className={S.ModalEmptyState} {...props} />;
};

export const ModalLoadingAndErrorWrapper = (
  props: LoadingAndErrorWrapperProps,
) => {
  return (
    <LoadingAndErrorWrapper
      className={S.ModalLoadingAndErrorWrapper}
      {...props}
    />
  );
};
