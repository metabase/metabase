
export function channelIsValid(channel, channelSpec) {
    if (!channelSpec) {
        return false;
    }
    switch (channel.schedule_type) {
        case "monthly": if (channel.schedule_frame != null &&
                            channel.schedule_hour != null) { return true }
        // these cases intentionally fall though
        case "weekly": if (channel.schedule_day == null) { return false }
        case "daily":  if (channel.schedule_hour == null) { return false }
        case "hourly": break;
        default:       return false;
    }
    if (channelSpec.recipients) {
        if (!channel.recipients/* || channel.recipients.length === 0*/) {
            return false;
        }
    }
    if (channelSpec.fields) {
        for (let field of channelSpec.fields) {
            if (field.required && (channel.details[field.name] == null || channel.details[field.name] == "")) {
                return false;
            }
        }
    }
    return true;
}

export function pulseIsValid(pulse, channelSpecs) {
    return (
        pulse.name &&
        pulse.cards.length > 0 &&
        pulse.channels.filter((c) => channelIsValid(c, channelSpecs && channelSpecs[c.channel_type])).length > 0
    ) || false;
}

export function cleanPulse(pulse, channelSpecs) {
    return {
        ...pulse,
        channels: pulse.channels.filter((c) => channelIsValid(c, channelSpecs && channelSpecs[c.channel_type]))
    };
}
