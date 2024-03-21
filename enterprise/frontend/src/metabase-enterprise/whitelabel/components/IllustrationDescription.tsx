import { t } from "ttag";

import { Flex, Text } from "metabase/ui";

import { ImageUploadInfoDot } from "./ImageUploadInfoDot";

type IllustrationType =
  | "login-page"
  | "landing-page"
  | "no-question-results"
  | "no-search-results";

interface IllustrationDescriptionProps {
  errorMessageContainerId: string;
  type: IllustrationType;
}

const TITLES: Record<IllustrationType, string> = {
  "login-page": t`Login page`,
  "landing-page": t`Landing page`,
  "no-question-results": t`No-results image for questions`,
  "no-search-results": t`No search results`,
};

export function IllustrationDescription({
  errorMessageContainerId,
  type,
}: IllustrationDescriptionProps) {
  return (
    <Text fw="bold" transform="none">
      <Flex align="center">
        {TITLES[type]}
        {ImageUploadInfoDot}
        <Text color="error" aria-hidden id={errorMessageContainerId}></Text>
      </Flex>
    </Text>
  );
}
