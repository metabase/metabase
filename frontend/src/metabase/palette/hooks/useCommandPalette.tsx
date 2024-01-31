import { t } from "ttag";
import {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  DetailedHTMLProps,
  useMemo,
} from "react";
import { push } from "react-router-redux";
import { useDispatch } from "metabase/lib/redux";
import { setOpenModal } from "metabase/redux/ui";
import * as Urls from "metabase/lib/urls";
import type { IconType } from "react-cmdk/src/components/Icon";
import type { RenderLink } from "react-cmdk";
import type { ButtonProps } from "react-cmdk/src/components/ListItem";
import type { IconName } from "metabase/ui";

export type CustomJsonStructure = Array<{
  items: Array<CustomJsonStructureItem>;
  heading?: string;
  id: string;
}>;

export interface CustomButtonProps
  extends Omit<ButtonProps, "icon">,
    ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName;
}

export type CustomJsonStructureItem = Omit<
  (CustomButtonProps & CustomLinkProps) & { id: string },
  "index"
>;

interface ListItemBaseProps {
  closeOnSelect?: boolean;
  icon?: IconName;
  iconType?: IconType;
  showType?: boolean;
  disabled?: boolean;
  keywords?: string[];
  index: number;
}

export interface CustomLinkProps
  extends Omit<ListItemBaseProps, "icon">,
    DetailedHTMLProps<
      AnchorHTMLAttributes<HTMLAnchorElement>,
      HTMLAnchorElement
    > {
  renderLink?: RenderLink;
  icon?: IconName;
}

export const useCommandPalette = () => {
  const dispatch = useDispatch();

  const defaultActions = useMemo<CustomJsonStructure>(
    () => [
      {
        id: "create-new",
        heading: t`Create new`,
        items: [
          {
            id: "create_collection",
            heading: t`Create new collection`,
            icon: "collection",
            onClick: () => dispatch(setOpenModal("collection")),
          },
          {
            id: "create_dashboard",
            heading: t`Create new dashboard`,
            icon: "dashboard",
            onClick: () => dispatch(setOpenModal("dashboard")),
          },
          {
            id: "create_question",
            heading: t`Create new question`,
            icon: "question",
            onClick: () =>
              dispatch(
                push(
                  Urls.newQuestion({
                    mode: "notebook",
                    creationType: "custom_question",
                  }),
                ),
              ),
          },
        ],
      },
    ],
    [dispatch],
  );

  return defaultActions;
};
