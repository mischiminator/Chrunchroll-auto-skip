# Chrome Web Store listing copy

**Status: repository draft, not published.** This text describes the current repository source (manifest 1.6.1), not a separately inspected store package. Paste the fields below into the developer dashboard only after checking that the uploaded package matches this source. Revisit the limitations after bug fixes; do not advertise them as fixed before testing.

## Title

Crunchyroll Auto Skip

## Short description

Automatically click available Crunchyroll skip controls for recaps, intros, credits and previews, with per-segment settings.

## Detailed description — ready to paste

Spend less time clicking skip controls on Crunchyroll.

Crunchyroll Auto Skip attempts to click visible player controls for recaps, intros/openings, outros/endings/credits, and next-episode previews. It works with controls Crunchyroll provides; it does not identify segment timestamps or skip sections when a matching control is unavailable.

CHOOSE WHAT TO SKIP
• Master switch for new automatic skip attempts.
• Separate switches for recaps, intros, outros, and previews.
• Adjustable 0–10 second delay for intros and outros, with a 3-second default.
• Recap and preview controls are clicked without an intentional delay.

KEEP A SEGMENT WHEN YOU WANT TO
Press D, or your configured single-character key, while a recognized control is present and before it is clicked. This cancels a pending skip and temporarily suppresses the detected segment type. It is not a global pause. Immediate skips may happen before there is time to use the shortcut.

SETTINGS AND LANGUAGES
Choose English, German, Spanish, or French in the popup. The initial language follows supported browser language settings, otherwise English. Preferences are saved with Chrome extension sync storage. Player settings changes normally reach already open matching tabs.

IMPORTANT LIMITATIONS OF THE CURRENT VERSION
• Skipping depends on button availability, wording, frame URL, and Crunchyroll's player UI. It is not guaranteed for every episode or frame.
• There is no preview seek fallback, timestamp detection, or debug switch.
• Turning the master switch off does not cancel an intro/outro click that was already scheduled. Use the configured hotkey while a recognized control is present to cancel a pending skip.
• Broad text matching can accidentally click unrelated preview/segment-labelled controls.
• The popup can show 3 seconds when zero is saved, shortcut help still displays D for custom keys, and the Advanced arrow is missing and produces console errors when toggled.
• Hotkey suppression can persist across some episode transitions, and shortcuts can interfere with typing inside nested editable content.

PERMISSIONS AND PRIVACY
Storage permission saves your preferences. Host access to Crunchyroll pages and its static player origin lets the extension inspect and click controls. The current source has no analytics or extension-operated backend. Preferences may synchronize through Chrome's own sync service. Diagnostic console messages can include the page URL, control text, and changed player settings.

This is an independent extension, not affiliated with or endorsed by Crunchyroll. It does not bypass subscription requirements, DRM, or access restrictions.

Source code, known issues, and support:
https://github.com/mischiminator/Chrunchroll-auto-skip

## Maintainer notes — do not paste as listing description

- Do not reuse the old README's claims about fallback seeking or a debug option.
- The shortcut's timing is control-dependent; do not promise it can always stop an immediate click or describe it as pausing all skips.
- Do not claim “no data ever leaves your device”: Chrome can sync preferences, and the user is visiting Crunchyroll.
- Review the store's privacy declarations against the actual submitted package, including Chrome sync and diagnostic logging. This document is not a completed dashboard privacy form or a substitute for a reviewed privacy policy.
- No screenshot assets or dashboard fields have been uploaded. Capture screenshots from the actual submitted version; avoid showing corrected controls that do not yet exist.
- Resolve the functional report's failures and perform live playback checks before marketing the extension as fully reliable. Existing users should still receive accurate limitations.
