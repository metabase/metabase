/* @flow */

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import ExternalLink from "metabase/components/ExternalLink";
import Confirm from "metabase/components/Confirm";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { CardApi, DashboardApi } from "metabase/services";
import Urls from "metabase/lib/urls";

type PublicLink = {
    id: string,
    name: string,
    public_uuid: string
};

type Props = {
    load:         () => Promise<PublicLink[]>,
    revoke:       (link: PublicLink) => Promise<void>,
    getUrl:       (link: PublicLink) => string,
    getPublicUrl: (link: PublicLink) => string,
    noLinksMessage: string,
};

type State = {
    list: ?PublicLink[],
    error: ?any
};

export default class PublicLinksListing extends Component<*, Props, State> {
    props: Props;
    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {
            list: null,
            error: null
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
        try {
            await this.props.revoke(link);
            this.load();
        } catch (error) {
            alert(error)
        }
    }

    render() {
        const { getUrl, getPublicUrl, revoke, noLinksMessage } = this.props;
        let { list, error } = this.state;

        if (list && list.length === 0) {
            error = new Error(noLinksMessage);
        }

        return (
            <LoadingAndErrorWrapper loading={!list} error={error}>
            { () =>
                <table className="ContentTable">
                    <thead>
                        <tr>
                            <th>Name</th>
                            { getPublicUrl &&
                                <th>Public Link</th>
                            }
                            { revoke &&
                                <th>Revoke Link</th>
                            }
                        </tr>
                    </thead>
                    <tbody>
                        { list && list.map(link =>
                            <tr>
                                <td>
                                    <Link to={getUrl(link)}>
                                        {link.name}
                                    </Link>
                                </td>
                                { getPublicUrl &&
                                    <td>
                                        <ExternalLink href={getPublicUrl(link)}>
                                            {getPublicUrl(link)}
                                        </ExternalLink>
                                    </td>
                                }
                                { revoke &&
                                    <td className="flex layout-centered">
                                        <Confirm
                                            title="Disable this link?"
                                            content="They won't work any more, and can't be restored, but you can create new links."
                                            action={() => this.revoke(link)}
                                        >
                                            <Icon
                                                name="close"
                                                className="text-grey-2 text-grey-4-hover cursor-pointer"
                                            />
                                        </Confirm>
                                    </td>
                                }
                            </tr>
                        ) }
                    </tbody>
                </table>
            }
            </LoadingAndErrorWrapper>
        );
    }
}

export const PublicLinksDashboardListing = () =>
    <PublicLinksListing
        load={DashboardApi.listPublic}
        revoke={DashboardApi.deletePublicLink}
        getUrl={({ id }) => Urls.dashboard(id)}
        getPublicUrl={({ public_uuid }) => window.location.origin + Urls.publicDashboard(public_uuid)}
        noLinksMessage="No dashboards have been publicly shared yet."
    />;

export const PublicLinksQuestionListing = () =>
    <PublicLinksListing
        load={CardApi.listPublic}
        revoke={CardApi.deletePublicLink}
        getUrl={({ id }) => Urls.card(id)}
        getPublicUrl={({ public_uuid }) => window.location.origin + Urls.publicCard(public_uuid)}
        noLinksMessage="No questions have been publicly shared yet."
    />;

export const EmbeddedDashboardListing = () =>
    <PublicLinksListing
        load={DashboardApi.listEmbeddable}
        getUrl={({ id }) => Urls.dashboard(id)}
        noLinksMessage="No dashboards have been embedded yet."
    />;

export const EmbeddedQuestionListing = () =>
    <PublicLinksListing
        load={CardApi.listEmbeddable}
        getUrl={({ id }) => Urls.card(id)}
        noLinksMessage="No questions have been embedded yet."
    />;
