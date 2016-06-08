import React, { Component, PropTypes } from "react";

import SidebarSection from "./SidebarSection.jsx";

export default class NextStep extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            next: null
        };
    }

    async componentWillMount() {
        let response = await fetch("/api/setup/admin_checklist", { credentials: 'same-origin' });
        if (response.status === 200) {
            let sections = await response.json();
            for (let section of sections) {
                for (let task of section.tasks) {
                    if (task.is_next_step) {
                        this.setState({ next: task });
                        break;
                    }
                }
            }
        }
    }

    render() {
        const { next } = this.state;
        if (next) {
            return (
                <SidebarSection title="Setup Tip" icon="clock" extra={<a className="text-brand no-decoration" href="/admin/settings">View all</a>}>
                    <a className="block p3 no-decoration" href={next.link}>
                        <h4 className="text-brand text-bold">{next.title}</h4>
                        <p className="m0 mt1">{next.description}</p>
                    </a>
                </SidebarSection>
            )
        } else {
            return <span className="hide" />
        }
    }
}
