import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import Icon from 'metabase/components/Icon.jsx';

export default class NewsletterForm extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = { submitted: false };

        this.styles = {
            container: {
                borderWidth: "2px"
            },

            input: {
                fontSize: '1.1rem',
                color: '#676C72',
                width: "350px"
            },

            label: {
                top: "-12px"
            }
        }
    }

    static propTypes = {
        password: PropTypes.string.isRequired
    };

    subscribeUser(e) {
        e.preventDefault();

        var formData = new FormData();
        formData.append("EMAIL", ReactDOM.findDOMNode(this.refs.email).value);
        formData.append("b_869fec0e4689e8fd1db91e795_b9664113a8", "");

        let req = new XMLHttpRequest();
        req.open("POST", "https://metabase.us10.list-manage.com/subscribe/post?u=869fec0e4689e8fd1db91e795&id=b9664113a8");
        req.send(formData);

        this.setState({submitted: true});
    }

    render() {
        const { initialEmail } = this.props;
        const { submitted } = this.state;

        return (
            <div style={this.styles.container} className="bordered rounded p4 relative">
                <div style={this.styles.label} className="absolute text-centered left right">
                    <div className="px3 bg-white h5 text-bold text-grey-4 text-uppercase inline-block">
                      <Icon className="mr1 float-left" name="mail" width="16px" height="16px" />
                      <span className="inline-block" style={{marginTop: 1}}>Metabase Newsletter</span>
                    </div>
                </div>

                <div className="MB-Newsletter sm-float-right">
                    <div>
                        <div style={{color: "#878E95"}} className="text-grey-4 text-strong h3 pb3">
                            Get infrequent emails about new releases and feature updates.
                        </div>

                        <form onSubmit={this.subscribeUser.bind(this)} noValidate>
                            <div>
                                { !submitted ?
                                    <div className="">
                                        <input ref="email" style={this.styles.input} className="AdminInput bordered rounded h3 inline-block" type="email" defaultValue={initialEmail} placeholder="Email address" />
                                        <input className="Button float-right inline-block ml1" type="submit" value="Subscribe" name="subscribe" />
                                    </div>
                                :
                                    <div className="text-success text-centered text-bold h3 p1">
                                        <Icon className="mr2" name="check" width="16px" height="16px" />You're subscribed.  Thanks for using Metabase!
                                    </div>
                                }
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    }
}
