import type { ReactNode } from "react";

import {
  LoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/common/components/LoadingAndErrorWrapper";
import { getSkeletonLineWidth } from "metabase/common/components/Skeletons";
import {
  TextArea,
  type TextAreaProps,
} from "metabase/common/components/TextArea";
import { Box, type BoxProps, Flex, Skeleton, Stack } from "metabase/ui";

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
  return <Box mb="lg" {...props} />;
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
      loader={<ValuesSourceTypeModalSkeleton />}
      {...props}
    />
  );
};

const SOURCE_TYPE_OPTION_COUNT = 3;

const ValuesSourceTypeModalSkeleton = () => (
  <Stack w="100%" h="100%" px="xxl" py="xl" justify="space-between">
    <Skeleton h={24} w="40%" radius="xs" />
    <ModalBodyWithPane>
      <ModalPane>
        <ModalSection>
          <Skeleton h={12} w="60%" radius="xs" mb="md" />
          <Stack gap="sm">
            {Array.from({ length: SOURCE_TYPE_OPTION_COUNT }, (_, index) => (
              <Flex key={index} align="center" gap="sm">
                <Skeleton h={20} w={20} circle />
                <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
              </Flex>
            ))}
          </Stack>
        </ModalSection>
        <ModalSection>
          <Skeleton h={12} w="70%" radius="xs" mb="md" />
          <Skeleton h={40} radius="sm" />
        </ModalSection>
      </ModalPane>
      <ModalMain>
        <Skeleton h="100%" radius="sm" />
      </ModalMain>
    </ModalBodyWithPane>
    <Flex justify="flex-end">
      <Skeleton h={40} w={80} radius="sm" />
    </Flex>
  </Stack>
);
