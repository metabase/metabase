export const convertParameterValuesBySlugToById = (
  valuesBySlug: Record<string, any> | undefined,
  params: { id: string; slug: string }[],
) => {
  if (!valuesBySlug) {
    return {};
  }

  return params.reduce<Record<string, any>>((byId, param) => {
    if (param.slug in valuesBySlug) {
      byId[param.id] = valuesBySlug[param.slug];
    }
    return byId;
  }, {});
};
