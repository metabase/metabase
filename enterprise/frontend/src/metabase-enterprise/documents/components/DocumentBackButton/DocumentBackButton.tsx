import { type HTMLAttributes, useCallback } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";
import { navigateBackToDocument } from "metabase-enterprise/documents/actions";
import {
  getDocument,
  getShowNavigateBackToDocumentButton,
} from "metabase-enterprise/documents/selectors";

export type DocumentBackButtonProps = {
  noLink?: boolean;
  onClick?: () => void;
  documentOverride?: {
    id: number;
    name: string;
  };
} & ActionIconProps &
  HTMLAttributes<HTMLButtonElement>;

export function DocumentBackButton({
  noLink,
  onClick,
  documentOverride,
  ...actionIconProps
}: DocumentBackButtonProps) {
  const documentState = useSelector(getDocument);
  const showButton = useSelector(getShowNavigateBackToDocumentButton);
  const document = documentOverride ?? documentState;
  const dispatch = useDispatch();

  const handleClick = useCallback(() => {
    if (document) {
      dispatch(navigateBackToDocument(document.id));
    }

    onClick?.();
  }, [document, dispatch, onClick]);

  if (!document || !showButton) {
    return null;
  }

  const label = t`Back to ${document.name}`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        variant="outline"
        radius="xl"
        size="2.625rem"
        color="border"
        aria-label={label}
        onClick={handleClick}
        component={noLink ? undefined : Link}
        to={`/document/${document.id}`}
        {...actionIconProps}
      >
        <Icon c="brand" name="arrow_left" />
      </ActionIcon>
    </Tooltip>
  );
}
