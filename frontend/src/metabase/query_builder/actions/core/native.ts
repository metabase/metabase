import { SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR } from "../../store/actions";

export const setIsShowingTemplateTagsEditor = (
  isShowingTemplateTagsEditor: boolean,
) => ({
  type: SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  isShowingTemplateTagsEditor,
});
