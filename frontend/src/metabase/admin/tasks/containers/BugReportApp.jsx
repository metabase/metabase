import React, { Component } from "react";
import { Box } from "grid-styled";
import AdminHeader from "metabase/components/AdminHeader";
import { t } from "ttag";
import { UtilApi } from "metabase/services";

function navigatorInfo() {
  return {
    appVersion: navigator.appVersion,
    language: navigator.language,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    vendor: navigator.vendor
  };
}

export default class BugReportApp extends Component {
  constructor() {
    super();
    this.state = {
      details: {},
    };
  }

  copyToClipboard = (e) => {
    this.textArea.select();
    document.execCommand('copy');
    this.setState({ copySuccess: 'Copied!' });
  };
  
  async fetchDetails() {
    const details = await UtilApi.bug_report_details();
    this.setState({ details: details });
  }

  componentWillMount() {
    this.fetchDetails();
  }
  
  render() {
    const { details } = this.state;
    return (
      <Box p={3}>
        <AdminHeader title={t`Bug Report Details`} />
        <h3>System Info</h3>
        <pre>{ JSON.stringify(details, null, 2) }</pre>

        <h3>Browser Info</h3>
        <pre>{ JSON.stringify(navigatorInfo(), null, 2) }</pre>

        <div>{
            /* Logical shortcut for only displaying the 
               button if the copy command exists */
            document.queryCommandSupported('copy') &&
              <div>
                <button onClick={ this.copyToClipboard }>Copy</button> 
                { this.state.copySuccess }
              </div>
           }
           
           <form>
             <textarea
               ref={(textarea) => this.textArea = textarea}
               defaultValue={ JSON.stringify(details, null, 2) +
                              "\n\n" +
                              JSON.stringify(navigatorInfo(), null, 2) }/>
           </form>
        </div>
      </Box>
    );
  }
}
