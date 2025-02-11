import {
  LoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/components/LoadingAndErrorWrapper";
import TextArea, {
  type TextAreaProps,
} from "metabase/core/components/TextArea";
import { Box, type BoxProps } from "metabase/ui";

import S from "./ValuesSourceTypeModal.module.css";

export const ModalBodyWithPane = (props: BoxProps) => {
  return <Box className={S.ModalBodyWithPane} {...props} />;
};

export const ModalPane = (props: BoxProps) => {
  return <Box className={S.ModalPane} {...props} />;
};

export const ModalMain = (props: BoxProps) => {
  return <Box className={S.ModalMain} {...props} />;
};

export const ModalSection = (props: BoxProps) => {
  return <Box mb="md" {...props} />;
};

export const ModalLabel = (props: BoxProps) => {
  return <Box component="label" className={S.ModalLabel} {...props} />;
};

export const ModalTextArea = (props: TextAreaProps) => {
  return <TextArea className={S.ModalTextArea} {...props} />;
};

export const ModalHelpMessage = (props: BoxProps) => {
  return <Box className={S.ModalHelpMessage} {...props} />;
};

export const ModalErrorMessage = (props: BoxProps) => {
  return <Box className={S.ModalErrorMessage} {...props} />;
};

export const ModalEmptyState = (props: BoxProps) => {
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
