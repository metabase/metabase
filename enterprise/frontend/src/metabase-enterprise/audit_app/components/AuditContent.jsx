/* eslint-disable react/prop-types */
import { Children, cloneElement, Component } from "react";

import Radio from "metabase/core/components/Radio";

import {
  AuditContentRoot,
  AuditContentHeading,
  AuditContentTabs,
  AuditContentData,
} from "./AuditContent.styled";

export default class AuditContent extends Component {
  render() {
    const { title, subtitle, tabs, children, location, ...props } = this.props;
    // HACK: remove the last component to get the base page path. won't work with tabs using IndexRoute (IndexRedirect ok)
    const pagePath = location && location.pathname.replace(/\/\w+$/, "");

    const hasHeading = title || subtitle;
    return (
      <AuditContentRoot>
        {hasHeading && (
          <AuditContentHeading>
            {title && <h2 className="PageTitle">{title}</h2>}
            {subtitle && <div className="my1">{subtitle}</div>}
          </AuditContentHeading>
        )}
        {tabs && (
          <AuditContentTabs>
            <Radio
              variant="underlined"
              value={this.props.router.location.pathname}
              options={tabs.filter(tab => tab.component)} // hide tabs that are not implemented
              optionValueFn={tab => `${pagePath}/${tab.path}`}
              optionNameFn={tab => tab.title}
              optionKeyFn={tab => tab.path}
              onChange={this.props.router.push}
            />
          </AuditContentTabs>
        )}
        <AuditContentData>
          {/* This allows the parent component to inject props into child route components, e.x. userId */}
          {Children.count(children) === 1 &&
          // NOTE: workaround for https://github.com/facebook/react/issues/12136
          !Array.isArray(children)
            ? cloneElement(Children.only(children), props)
            : children}
        </AuditContentData>
      </AuditContentRoot>
    );
  }
}
