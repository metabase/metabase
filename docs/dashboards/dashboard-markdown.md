---
title: Dashboard heading and text cards
summary: Add context to your dashboards with text and heading cards, including formatted text, images, dividers, and filter values.
---

# Dashboard heading and text cards

Add heading and text cards to your dashboards to label sections, link to other content, display images, and more:

- **Heading cards** for a single line of text that titles a section
- **Text cards** for longer text you can format with Markdown

## Add a heading or text card

To add a heading or text card to a dashboard:

1. Click the **pencil icon** to edit the dashboard.
2. Click the **text card button** in the top right.
3. Choose **Heading** or **Text**.

![Text card menu](images/text-card-menu.png)

To move a card, click and drag it. To resize a card, click and drag the handle in its bottom right corner.

Click a card to edit the text. Click away from the card to preview the text.

## Heading cards

A heading card holds a single line of text. Use a heading card to title a dashboard or label a section of charts.

![Section heading card](images/section-heading-card.png)

A few things to know about heading cards:

- The text is always left-aligned.
- The text stays the same size, regardless of how you size the card.
- You can't use Markdown in heading cards. Markdown syntax renders as plain text.

You can add a filter value to a heading card using a variable. See [Add filter values to a card](#add-filter-values-to-a-card).

## Text cards

A text card displays text you write in Markdown. Add formatting like bold text, lists, links, and images.

![Text card Markdown example](images/text-card-markdown-example.png)

### Change a text card's alignment

You can set how text sits inside a text card. Open the card's **Visualization options** to choose its alignment:

- **Horizontal alignment:** Left, Center, or Right.
- **Vertical alignment:** Top, Middle, or Bottom.

Vertical alignment is easiest to see in a tall card, where the text has room to sit at the top, middle, or bottom.

![Center-aligned text card](images/text-card-alignment-centered.png)

### Remove a text card's background

By default, a text card has a white background. To remove the background, open the card's **Visualization options** and disable the **Show background** toggle.

Removing the background makes a card blend into the dashboard. Here's the same card with its background on (top) and off (bottom):

![​The same text card shown twice: with its background on (top) and removed (bottom)](images/text-card-background.png)

### Add a divider

To add a horizontal line that separates sections of your dashboard, add a text card that contains three dashes:

```text
---
```

Metabase renders the three dashes as a horizontal line.

## Add filter values to a card

You can show the value of a dashboard filter inside a heading or text card. This lets you write text that updates when someone changes the filter.

For example, a card might contain:

```text
Our revenue over {{Date}}:
```

Then, when someone selects "Previous 30 days" in the connected filter, the card displays:

![Dashboard card variable](images/dashboard-card-variable.png)

To add a filter value to a card:

1. [Add a filter](../dashboards/filters.md) to your dashboard.
2. Add a variable to your card by wrapping a name in double braces, like `{{Date}}`.
3. Connect the filter to the card's variable.

A few things to know:

- A filter connected to a card changes only that card's text. It doesn't filter the charts around it.
- You can insert a filter's value, but not query results like a number or table from a question.

## Add an image

If your admin has [allowed domains for images](../configuring-metabase/settings.md#allowed-domains-for-images), you can add an image to a dashboard. Add a text card and use Markdown image syntax:

```text
![A description of the image](https://example.com/image.png)
```

You can't upload an image to Metabase. Host the image somewhere else, then link to the image URL. The URL needs to be one your Metabase can access.