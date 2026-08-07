import { SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR } from "metabase/redux/query-builder";

export const setIsShowingTemplateTagsEditor = (
  isShowingTemplateTagsEditor: boolean,
) => ({
  type: SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  isShowingTemplateTagsEditor,
});
