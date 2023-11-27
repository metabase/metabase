import styled from "@emotion/styled";
import CopyButton from "metabase/components/CopyButton";
import {Box} from "metabase/ui"

export const PublicLinkCopyButton = styled(CopyButton)`
  position: relative;
  top: 2px;
`

export const PublicLinkTextContainer = styled(Box)`
  flex: 1;
  overflow: hidden;
`