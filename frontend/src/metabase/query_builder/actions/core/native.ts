export const SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR =
  "metabase/qb/SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR";
export const setIsShowingTemplateTagsEditor = (
  isShowingTemplateTagsEditor: boolean,
) => ({
  type: SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  isShowingTemplateTagsEditor,
});
