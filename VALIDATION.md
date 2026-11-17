# Validation

- Seven Node.js integration tests pass. Coverage includes contribution storage/removal, authenticated catalogs, byte-for-byte streaming between app instances, excluding own files in connected mode, offline peers, upload limits, remote operator restrictions, and local test uploads entering the draw pool.
- The new local test regression covers upload → stock count → draw → byte-for-byte download → remove → invalidated download ticket. Starter files return only when there are no local contributions.
- Revised desktop and phone screenshots are in ignored `shots/redesign-1440.png` and `shots/redesign-390.png`. The machine now renders live stock rather than decorative pretend files.
- The previous frontend skill layout checker crashed internally (`r.sections is not iterable`). A clean automated layout result is not claimed. Previous performance measurements belong to the earlier interface and are not evidence for the redesign.
- Real transfers across Tailscale have not been verified; integration tests use separate loopback processes.
- Small local raster images (up to 2 MB) show previews. Larger images show their file type to avoid fetching the full upload merely to display a thumbnail. Downloads support the full 20 MB limit.

## Focused UX update

The main screen now contains the machine and inline file upload. Tab navigation, the activity feed, collection views, network dashboard, and upload modal have been removed from the primary flow. Contribution removal remains in a collapsed disclosure, and peer setup remains in How it works. Upload selection has an explicit Add to the mix action with inline success/errors. Existing stored contributions are preserved. Desktop/mobile screenshots are in `shots/focused-1440.png` and `shots/focused-390.png`. Frontend syntax and DOM references checked; backend unchanged.

## Brutalist theme

Restyled the focused machine/upload screen with acid yellow, electric blue, thick black borders, square controls, bold typography, and hard shadows. Result/help dialogs, contribution management, focus states, and reduced motion behavior use the same theme. Desktop and mobile screenshots: `shots/brutalist-1440.png` and `shots/brutalist-390.png`. Frontend syntax and whitespace checks pass. No file-sharing behavior changed.

## Original cabinet styling restored

The cabinet now uses the original coral body, illustrated file packets on two shelves, glass reflection, side display, coin slot, working round vend button, speaker vents, and delivery hatch. The bold page theme and inline upload flow remain. Stock still comes from the live pool; the cabinet does not add decorative files to the draw pool. JavaScript syntax, element IDs, and references checked. Screenshots: `shots/restored-machine-1440.png` and `shots/restored-machine-390.png`. Backend unchanged.

## Machine as the primary experience

The restored cabinet is now centered at up to 550px wide. The large page title is visually hidden while remaining accessible. Upload and file management moved to an on-demand side drawer, reached through quiet header/below-machine controls. Successful uploads close the drawer and refresh the live stock. Checked JavaScript syntax, element references, unique IDs, and placement of the drawer outside the machine stage. Backend unchanged. Screenshots: `shots/machine-first-1440.png` and `shots/machine-first-390.png`.
