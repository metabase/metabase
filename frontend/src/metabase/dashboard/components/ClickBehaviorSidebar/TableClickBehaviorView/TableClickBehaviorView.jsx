/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";

import { hasActionsMenu } from "metabase/lib/click-behavior";

import Sidebar from "metabase/dashboard/components/Sidebar";

import Column from "./Column";
import { Heading, SidebarHeader } from "../ClickBehaviorSidebar.styled";

function TableClickBehaviorView({
  columns,
  dashcard,
  getClickBehaviorForColumn,
  canClose,
  onColumnClick,
  onCancel,
  onClose,
}) {
  return (
    <Sidebar onClose={onClose} onCancel={onCancel} closeIsDisabled={!canClose}>
      <SidebarHeader>
        <Heading className="text-paragraph">{t`On-click behavior for each column`}</Heading>
      </SidebarHeader>
      <div>
        {_.chain(columns)
          .map(column => ({
            column,
            clickBehavior: getClickBehaviorForColumn(column),
          }))
          .groupBy(({ clickBehavior }) => {
            const { type = "actionMenu" } = clickBehavior || {};
            return type;
          })
          .pairs()
          .sortBy(([linkType]) =>
            ["link", "crossfilter", "actionMenu"].indexOf(linkType),
          )
          .map(([linkType, columnsWithClickBehavior]) => (
            <div key={linkType} className="mb2 px4">
              <h5 className="text-uppercase text-medium my1">
                {
                  {
                    link: t`Go to custom destination`,
                    crossfilter: t`Update a dashboard filter`,
                    actionMenu: hasActionsMenu(dashcard)
                      ? t`Open the actions menu`
                      : t`Do nothing`,
                  }[linkType]
                }
              </h5>
              {columnsWithClickBehavior.map(
                ({ column, clickBehavior }, index) => (
                  <Column
                    key={index}
                    column={column}
                    clickBehavior={clickBehavior}
                    onClick={() => onColumnClick(column)}
                  />
                ),
              )}
            </div>
          ))
          .value()}
      </div>
    </Sidebar>
  );
}

export default TableClickBehaviorView;
