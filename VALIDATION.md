# Validation

- Seven Node.js integration tests pass. Coverage includes contribution storage/removal, authenticated catalogs, byte-for-byte streaming between app instances, excluding own files in connected mode, offline peers, upload limits, remote operator restrictions, and local test uploads entering the draw pool.
- The new local test regression covers upload → stock count → draw → byte-for-byte download → remove → invalidated download ticket. Starter files return only when there are no local contributions.
- Revised desktop and phone screenshots are in ignored `shots/redesign-1440.png` and `shots/redesign-390.png`. The machine now renders live stock rather than decorative pretend files.
- The previous frontend skill layout checker crashed internally (`r.sections is not iterable`). A clean automated layout result is not claimed. Previous performance measurements belong to the earlier interface and are not evidence for the redesign.
- Real transfers across Tailscale have not been verified; integration tests use separate loopback processes.
- Small local raster images (up to 2 MB) show previews. Larger images show their file type to avoid fetching the full upload merely to display a thumbnail. Downloads support the full 20 MB limit.
