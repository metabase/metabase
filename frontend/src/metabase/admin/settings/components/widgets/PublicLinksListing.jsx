/* @flow */

import React, { Component } from "react";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import ExternalLink from "metabase/components/ExternalLink";
import Confirm from "metabase/components/Confirm";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { t } from "ttag";
import { CardApi, DashboardApi } from "metabase/services";
import * as Urls from "metabase/lib/urls";

import MetabaseAnalytics from "metabase/lib/analytics";

type PublicLink = {
  id: string,
  name: string,
  public_uuid: string,
};

type Props = {
  load: () => Promise<PublicLink[]>,
  revoke?: (link: PublicLink) => Promise<void>,
  getUrl: (link: PublicLink) => string,
  getPublicUrl?: (link: PublicLink) => string,
  noLinksMessage: string,
  type: string,
};

type State = {
  list: ?(PublicLink[]),
  error: ?any,
};

export default class PublicLinksListing extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      list: null,
      error: null,
    };
  }

  componentWillMount() {
    this.load();
  }

  async load() {
    try {
      const list = await this.props.load();
      this.setState({ list });
    } catch (error) {
      this.setState({ error });
    }
  }

  async revoke(link: PublicLink) {
    if (!this.props.revoke) {
      return;
    }
    try {
      await this.props.revoke(link);
      this.load();
    } catch (error) {
      alert(error);
    }
  }

  trackEvent(label: string) {
    MetabaseAnalytics.trackEvent(`Admin ${this.props.type}`, label);
  }

  render() {
    const { getUrl, getPublicUrl, revoke, noLinksMessage } = this.props;
    let { list, error } = this.state;

    if (list && list.length === 0) {
      error = new Error(noLinksMessage);
    }

    return (
      <LoadingAndErrorWrapper loading={!list} error={error}>
        {() => (
          <table className="ContentTable">
            <thead>
              <tr>
                <th>{t`Name`}</th>
                {getPublicUrl && <th>{t`Public Link`}</th>}
                {revoke && <th>{t`Revoke Link`}</th>}
              </tr>
            </thead>
            <tbody>
              {list &&
                list.map(link => (
                  <tr>
                    <td>
                      <Link
                        to={getUrl(link)}
                        onClick={() => this.trackEvent("Entity Link Clicked")}
                        className="text-wrap"
                      >
                        {link.name}
                      </Link>
                    </td>
                    {getPublicUrl && (
                      <td>
                        <ExternalLink
                          href={getPublicUrl(link)}
                          onClick={() => this.trackEvent("Public Link Clicked")}
                          className="link text-wrap"
                        >
                          {getPublicUrl(link)}
                        </ExternalLink>
                      </td>
                    )}
                    {revoke && (
                      <td className="flex layout-centered">
                        <Confirm
                          title={t`Disable this link?`}
                          content={t`They won't work anymore, and can't be restored, but you can create new links.`}
                          action={() => {
                            this.revoke(link);
                            this.trackEvent("Revoked link");
                          }}
                        >
                          <Icon
                            name="close"
                            className="text-light text-medium-hover cursor-pointer"
                          />
                        </Confirm>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

export const PublicLinksDashboardListing = () => (
  <PublicLinksListing
    load={DashboardApi.listPublic}
    revoke={DashboardApi.deletePublicLink}
    type={t`Public Dashboard Listing`}
    getUrl={({ id }) => Urls.dashboard(id)}
    getPublicUrl={({ public_uuid }) => Urls.publicDashboard(public_uuid)}
    noLinksMessage={t`No dashboards have been publicly shared yet.`}
  />
);

export const PublicLinksQuestionListing = () => (
  <PublicLinksListing
    load={CardApi.listPublic}
    revoke={CardApi.deletePublicLink}
    type={t`Public Card Listing`}
    getUrl={({ id }) => Urls.question(id)}
    getPublicUrl={({ public_uuid }) => Urls.publicQuestion(public_uuid)}
    noLinksMessage={t`No questions have been publicly shared yet.`}
  />
);

export const EmbeddedDashboardListing = () => (
  <div className="bordered rounded full" style={{ maxWidth: 820 }}>
    <PublicLinksListing
      load={DashboardApi.listEmbeddable}
      getUrl={({ id }) => Urls.dashboard(id)}
      type={t`Embedded Dashboard Listing`}
      noLinksMessage={t`No dashboards have been embedded yet.`}
    />
  </div>
);

export const EmbeddedQuestionListing = () => (
  <div className="bordered rounded full" style={{ maxWidth: 820 }}>
    <PublicLinksListing
      load={CardApi.listEmbeddable}
      getUrl={({ id }) => Urls.question(id)}
      type={t`Embedded Card Listing`}
      noLinksMessage={t`No questions have been embedded yet.`}
    />
  </div>
);
