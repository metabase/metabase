/* @flow */

import React from "react";
import _ from "underscore";

import { MetabaseApi, AutoApi } from "metabase/services";

import type { DatabaseCandidates } from "metabase/meta/types/Auto";

type Props = {
  databaseId: number,
  children: (props: RenderProps) => ?React$Element<any>,
};

type RenderProps = {
  candidates: ?DatabaseCandidates,
  sampleCandidates: ?DatabaseCandidates,
  isSample: ?boolean,
};

type State = {
  databaseId: ?number,
  isSample: ?boolean,
  candidates: ?DatabaseCandidates,
  sampleCandidates: ?DatabaseCandidates,
};

const CANDIDATES_POLL_INTERVAL = 2000;
// ensure this is 1 second offset from CANDIDATES_POLL_INTERVAL due to
// concurrency issue in candidates endpoint
const CANDIDATES_TIMEOUT = 11000;

class CandidateListLoader extends React.Component {
  props: Props;
  state: State = {
    databaseId: null,
    isSample: null,
    candidates: null,
    sampleCandidates: null,
  };

  _sampleTimeout: ?number;
  _pollTimer: ?number;

  // $FlowFixMe: doesn't expect componentWillMount to return Promise<void>
  async componentWillMount() {
    // If we get passed in a database id, just use that.
    // Don't fall back to the sample dataset
    if (this.props.databaseId) {
      this.setState({ databaseId: this.props.databaseId }, () => {
        this._loadCandidates();
      });
    } else {
      // Otherwise, it's a fresh start. Grab the last added database
      const [sampleDbs, otherDbs] = _.partition(
        await MetabaseApi.db_list(),
        db => db.is_sample,
      );
      if (otherDbs.length > 0) {
        this.setState({ databaseId: otherDbs[0].id, isSample: false }, () => {
          this._loadCandidates();
        });
        // If things are super slow for whatever reason,
        // just load candidates for sample dataset
        this._sampleTimeout = setTimeout(async () => {
          this._sampleTimeout = null;
          this.setState({
            sampleCandidates: await AutoApi.db_candidates({
              id: sampleDbs[0].id,
            }),
          });
        }, CANDIDATES_TIMEOUT);
      } else {
        this.setState({ databaseId: sampleDbs[0].id, isSample: true }, () => {
          this._loadCandidates();
        });
      }
    }
    this._pollTimer = setInterval(
      this._loadCandidates,
      CANDIDATES_POLL_INTERVAL,
    );
  }
  componentWillUnmount() {
    this._clearTimers();
  }
  _clearTimers() {
    if (this._pollTimer != null) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._sampleTimeout != null) {
      clearInterval(this._sampleTimeout);
      this._sampleTimeout = null;
    }
  }
  _loadCandidates = async () => {
    try {
      const { databaseId } = this.state;
      if (databaseId != null) {
        const candidates = await AutoApi.db_candidates({
          id: databaseId,
        });
        if (candidates && candidates.length > 0) {
          this._clearTimers();
          this.setState({ candidates });
        }
      }
    } catch (e) {
      console.log(e);
    }
  };
  render() {
    const { candidates, sampleCandidates, isSample } = this.state;
    return this.props.children({
      candidates,
      sampleCandidates,
      isSample,
    });
  }
}

export default CandidateListLoader;
