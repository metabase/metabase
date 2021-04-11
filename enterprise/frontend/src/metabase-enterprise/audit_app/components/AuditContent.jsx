/* eslint-disable react/prop-types */
import React from "react";

import Radio from "metabase/components/Radio";

export default class AuditContent extends React.Component {
  render() {
    const { title, subtitle, tabs, children, location, ...props } = this.props;
    // HACK: remove the last component to get the base page path. won't work with tabs using IndexRoute (IndexRedirect ok)
    const pagePath = location && location.pathname.replace(/\/\w+$/, "");
    return (
      <div className="py4 flex flex-column flex-full">
        <div className="px4">
          <h2 className="PageTitle">{title}</h2>
          {subtitle && <div className="my1">{subtitle}</div>}
        </div>
        {tabs && (
          <div className="border-bottom px4 mt1">
            <Radio
              underlined
              value={this.props.router.location.pathname}
              options={tabs.filter(tab => tab.component)} // hide tabs that aren't implemented
              optionValueFn={tab => `${pagePath}/${tab.path}`}
              optionNameFn={tab => tab.title}
              optionKeyFn={tab => tab.path}
              onChange={this.props.router.push}
            />
          </div>
        )}
        <div className="px4 full-height">
          {/* This allows the parent component to inject props into child route components, e.x. userId */}
          {React.Children.count(children) === 1 &&
          // NOTE: workaround for https://github.com/facebook/react/issues/12136
          !Array.isArray(children)
            ? React.cloneElement(React.Children.only(children), props)
            : children}
        </div>
      </div>
    );
  }
}
