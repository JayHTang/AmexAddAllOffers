# Amex Offer Adder Extension

A Chrome Manifest V3 extension that adds all available American Express offers to your card with one click.

## Features

- **Modern Amex Offers Hub support**: Works across American Express Offers Hub List View (`merchantOfferListAddButton`), Grid View (`enrollPlusButton`), Offer Details Modal (`addToCardBtn`), and legacy Amex Offers pages.
- **Sequential enrollment engine**: Waits for each offer's loading spinner to finish, then pauses with a jittered ~1.0–1.4s delay before clicking the next offer.
- **Live progress & toolbar badge**: Shows remaining offer count on the extension icon and live progress in the popup (persisting even if the popup is closed and reopened mid-run), plus a **Stop** button to cancel at any time.
- **Optional bonus-offer filter**: Includes a checkbox (enabled by default and saved via `chrome.storage.local`) to skip `"Bonus Membership Rewards Points Offer"`.

## Installation (Load Unpacked in Chrome)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this repository folder.

## Usage

1. Sign in to `https://global.americanexpress.com/offers`.
2. Click the **Amex Offer Adder** icon in the Chrome toolbar.
3. Click **Add All Offers** (or **Stop** at any time).
