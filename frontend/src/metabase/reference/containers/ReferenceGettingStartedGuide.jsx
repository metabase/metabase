/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import { connect } from 'react-redux';
import { reduxForm } from "redux-form";
import cx from "classnames";

import S from "metabase/reference/Reference.css";

import EditHeader from "metabase/reference/components/EditHeader.jsx";
import GuideEmptyState from "metabase/reference/components/GuideEmptyState.jsx"
import GuideHeader from "metabase/reference/components/GuideHeader.jsx"
import GuideDetail from "metabase/reference/components/GuideDetail.jsx"

import * as actions from 'metabase/reference/reference';

import {
    getUser,
    getIsEditing
} from '../selectors';

import {
    isGuideEmpty
} from '../utils';

const mapStateToProps = (state, props) => ({
    guide: {
        things_to_know: "test",
        contact: { name: null, email: null },
        most_important_dashboard: null,
        important_metrics: [],
        important_tables: [],
        important_segments: []
    },
    user: getUser(state),
    isEditing: getIsEditing(state)
});

const mapDispatchToProps = {
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
@reduxForm({
    form: 'guide',
    fields: []
})
export default class ReferenceGettingStartedGuide extends Component {
    static propTypes = {
        isEditing: PropTypes.bool
    };

    render() {
        const {
            style,
            guide,
            user,
            isEditing,
            startEditing,
            endEditing,
            handleSubmit,
            submitting
        } = this.props;

        const onSubmit = handleSubmit(async (fields) => 
            console.log(fields)
        );

        return (
            <form className="full" style={style} onSubmit={onSubmit}>
                { isEditing &&
                    <EditHeader
                        endEditing={endEditing}
                        submitting={submitting}
                    />
                }
                { isGuideEmpty(guide) ? 
                    <GuideEmptyState 
                        isSuperuser={user && user.is_superuser}
                        startEditing={startEditing} 
                    /> :
                    isEditing ?
                        <div className="full">
                        </div> :
                        <div className="full">
                            <GuideHeader startEditing={startEditing} />
                            <div className="wrapper wrapper--trim">
                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Dashboard
                                    </div>
                                </div>
                                <GuideDetail 
                                    title={'Marketing KPIs'} 
                                    description={'This dashboard contains metrics about ad buys, impressions, etc.'} 
                                    link={'test'} 
                                    linkClass={'text-green'} 
                                />
                                <div className={S.guideSeeAll}>
                                    <div className={S.guideSeeAllBody}>
                                        <Link className={cx('text-green', S.guideSeeAllLink)} to={'test'}>
                                            See all dashboards
                                        </Link>
                                    </div>
                                </div>
                                
                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Useful metrics
                                    </div>
                                </div>
                                <GuideDetail 
                                    title={'Cost per click'} 
                                    description={'How much we pay for each click that we receive, not counting some esoteric exceptions.'} 
                                    value={'$0.91'} 
                                    hasLearnMore={true}
                                    exploreLinks={[
                                        {id: 'test1', name: 'Ad Campaign'},
                                        {id: 'test2', name: 'Platform'},
                                        {id: 'test3', name: 'Channel'}
                                    ]}
                                    link={'test'} 
                                    linkClass={'text-brand'} 
                                />
                                <GuideDetail 
                                    title={'Cost per click'} 
                                    description={'How much we pay for each click that we receive, not counting some esoteric exceptions.'} 
                                    value={'$0.91'} 
                                    hasLearnMore={true}
                                    exploreLinks={[
                                        {id: 'test1', name: 'Ad Campaign'},
                                        {id: 'test2', name: 'Platform'},
                                        {id: 'test3', name: 'Channel'}
                                    ]}
                                    link={'test'} 
                                    linkClass={'text-brand'} 
                                />
                                <div className={S.guideSeeAll}>
                                    <div className={S.guideSeeAllBody}>
                                        <Link className={cx('text-brand', S.guideSeeAllLink)} to={'test'}>
                                            See all metrics
                                        </Link>
                                    </div>
                                </div>

                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Segments and tables
                                    </div>
                                </div>
                                <GuideDetail 
                                    title={'Impressions'} 
                                    description={'A table recording each ad impression with information about each impression.'} 
                                    hasLearnMore={true}
                                    link={'test'} 
                                    linkClass={'text-purple'} 
                                />
                                <GuideDetail 
                                    title={'Impressions'} 
                                    description={'A table recording each ad impression with information about each impression.'} 
                                    hasLearnMore={true}
                                    link={'test'} 
                                    linkClass={'text-purple'} 
                                />
                                <GuideDetail 
                                    title={'Impressions'} 
                                    description={'A table recording each ad impression with information about each impression.'} 
                                    hasLearnMore={true}
                                    link={'test'} 
                                    linkClass={'text-purple'} 
                                />
                                <div className={S.guideSeeAll}>
                                    <div className={S.guideSeeAllBody}>
                                        <Link className={cx('text-purple', S.guideSeeAllLink)} to={'test'}>
                                            See all segments
                                        </Link>
                                        <Link className={cx('text-purple', S.guideSeeAllLink)} to={'test'}>
                                            See all tables
                                        </Link>
                                    </div>
                                </div>

                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Some things to know
                                    </div>
                                </div>
                                <GuideDetail 
                                    description={'Gaper losses league forkball pennant cubs balk no-hitter. Breaking ball national pastime series cy young left field walk off sacrifice fly cycle.'} 
                                />
                                <div className={S.guideSeeAll}>
                                    <div className={S.guideSeeAllBody}>
                                        <Link className={cx('text-brand', S.guideSeeAllLink)} to={'test'}>
                                            Explore our data
                                        </Link>
                                    </div>
                                </div>

                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Have questions?
                                    </div>
                                </div>
                                <div className={S.guideContact}>
                                    <div className={S.guideContactBody}>
                                        <span className="text-dark mr3">
                                            Contact Sameer Al-Sakran
                                        </span>
                                        <Link className="text-brand text-bold no-decoration" to="test">
                                            s-dog@metabase.com
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                }
            </form>
        );
    }
}