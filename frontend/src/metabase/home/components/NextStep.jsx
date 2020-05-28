import React, { Component } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { SetupApi } from "metabase/services";

import SidebarSection from "./SidebarSection";

export default class NextStep extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      next: null,
    };
  }

  async componentWillMount() {
    const sections = await SetupApi.admin_checklist(null, { noEvent: true });
    for (const section of sections) {
      for (const task of section.tasks) {
        if (task.is_next_step) {
          this.setState({ next: task });
          break;
        }
      }
    }
  }

  render() {
    const { next } = this.state;
    if (next) {
      return (
        <SidebarSection
          title={t`Setup Tip`}
          icon="info"
          extra={
            <Link
              to="/admin/settings"
              className="text-brand no-decoration"
            >{t`View all`}</Link>
          }
        >
          <Link to={next.link} className="block p3 no-decoration">
            <h4 className="text-brand text-bold">{next.title}</h4>
            <p className="m0 mt1">{next.description}</p>
          </Link>
        </SidebarSection>
      );
    } else {
      return <span className="hide" />;
    }
  }
}
