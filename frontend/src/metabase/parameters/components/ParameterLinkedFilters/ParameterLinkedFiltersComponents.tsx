import type { MouseEventHandler, ReactNode } from "react";

import { Box, type BoxProps, Flex, type FlexProps } from "metabase/ui";

import S from "./ParameterLinkedFilters.module.css";

interface BoxPropsWithChildren extends BoxProps {
  children?: ReactNode;
}

export const SectionHeader = (props: BoxPropsWithChildren) => {
  return <Box fz="md" fw="bold" {...props} />;
};

export const SectionMessage = (props: BoxPropsWithChildren) => {
  return <Box component="p" className={S.SectionMessage} {...props} />;
};

export const SectionMessageLink = (
  props: BoxPropsWithChildren & { onClick?: MouseEventHandler },
) => {
  return <Box component="span" className={S.SectionMessageLink} {...props} />;
};

export const ParameterRoot = (props: BoxPropsWithChildren) => {
  return <Box mb="md" className={S.ParameterRoot} {...props} />;
};

export const ParameterBody = (props: FlexProps) => {
  return <Flex justify="space-between" align="center" p="md" {...props} />;
};

export const ParameterName = (
  props: BoxPropsWithChildren & { onClick?: MouseEventHandler },
) => {
  return <Box className={S.ParameterName} {...props} />;
};

export const FieldListRoot = (props: BoxPropsWithChildren) => {
  return <Box fz="0.765rem" {...props} />;
};

export const FieldListHeader = (props: FlexProps) => {
  return <Flex className={S.FieldListHeader} {...props} />;
};

export const FieldListTitle = (props: BoxPropsWithChildren) => {
  return <Box className={S.FieldListTitle} {...props} />;
};

export const FieldListItem = (props: BoxPropsWithChildren) => {
  return <Box className={S.FieldListItem} {...props} />;
};

export const FieldRoot = (props: BoxPropsWithChildren) => {
  return <Box w="100%" p="0.5rem 1rem" {...props} />;
};

export const FieldLabel = (props: BoxPropsWithChildren) => {
  return <Box className={S.FieldLabel} {...props} />;
};
