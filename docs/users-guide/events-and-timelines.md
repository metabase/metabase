# Events and timelines

A lot of discussions around data have a moment when someone asks a question related to a specific point in time: "Wait, what's the spike in March again?", or "When did the new widget launch?"

Events and timelines are a way to capture that chronological knowledge and make it available when you need it, in context (i.e., when you're viewing a chart). They're a great way to store institutional knowledge about what happened and when, so people (including yourself three months from now) won't have to figure out (again) why the line chart spiked back in March.

## Events

Events are basically dates + a description + an icon. You can add events to Metabase to show important milestones, launches, or anything else, right alongside your data.

When viewing a [collection](collections.md), you can view, add, or edit events by clicking on the calendar icon in the upper right.

![In a collection, view or add events by clicking on the calendar icon](./images/events-and-timelines/event-calendar.png)

Once you create an event, the event will show up in charts in the collection, provided:

- the date of the event falls with the chart's time range, and
- the timeline is visible to items in that collection (more on that below)

You'll see an icon along the x-axis that plots the event. A vertical line will extend from the event so you can see when data plotted on the chart intersects with the event. 

![An event on a chart](./images/events-and-timelines/example-event.png)

## Timelines

![Add a new timeline](./images/events-and-timelines/new-timeline.png)

You can group events into timelines. For example, you may want to have an email campaign timeline that tracks, or an outages timeline that tracks downtime.

## How collections, timelines, and events fit together

Collections have timelines, and timelines contain events. 

### Moving events to other timelines 

TOOD: Currently, you can't "cross timelines". We're working out the physics behind timeline portals, but in the meantime, if you want to move an event from one timeline to another, you'll need to archive the original event, and recreate that event in the new/other timeline.

## Moving timelines to another collection

TODO:
