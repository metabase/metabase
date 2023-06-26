import { t } from "ttag";

import AccordionList from "metabase/core/components/AccordionList";
import { Icon } from "metabase/core/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import {
  withUserAttributes,
  isMappableColumn,
} from "metabase/dashboard/components/ClickMappings";

function prefixIfNeeded(values, prefix, otherLists) {
  const otherValues = otherLists.flat().map(s => s.toLowerCase());
  return values.map(value =>
    otherValues.includes(value.toLowerCase()) ? `${prefix}:${value}` : value,
  );
}

const ValuesYouCanReference = withUserAttributes(
  ({ dashcard, parameters, userAttributes }) => {
    const columnMetadata = dashcard.card.result_metadata || [];
    const columns = columnMetadata?.filter(isMappableColumn).map(c => c.name);
    const parameterNames = parameters.map(p => p.name);
    const sections = [
      {
        items: prefixIfNeeded(columns, "column", [
          parameterNames,
          userAttributes,
        ]),
        name: t`Columns`,
      },
      {
        items: prefixIfNeeded(parameterNames, "filter", [
          columns,
          userAttributes,
        ]),
        name: t`Dashboard filters`,
      },
      {
        items: prefixIfNeeded(userAttributes, "user", [
          parameterNames,
          columns,
        ]),
        name: t`User attributes`,
      },
    ].filter(section => section.items.length > 0);

    if (!sections.length) {
      return null;
    }

    return (
      <PopoverWithTrigger
        triggerElement={
          <div className="flex align-center cursor-pointer my2 text-medium text-brand-hover">
            <h4>{t`Values you can reference`}</h4>
            <Icon name="chevrondown" className="ml1" size={12} />
          </div>
        }
      >
        <AccordionList
          alwaysExpanded
          sections={sections}
          renderItemName={name => name}
          itemIsClickable={() => false}
        />
      </PopoverWithTrigger>
    );
  },
);

export default ValuesYouCanReference;
