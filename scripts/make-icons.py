# Draws the app icon (orange play triangle on black) without dependencies: icon-180/192/512.png.
import struct, zlib, sys, os
def png(n, path):
    rows = []
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            # triangle with vertices (0.36,0.28) (0.36,0.72) (0.74,0.5), 4x supersampling for smooth edges
            hit = 0
            for sy in range(4):
                for sx in range(4):
                    u, v = (x + (sx + .5) / 4) / n, (y + (sy + .5) / 4) / n
                    if u >= .36 and abs(v - .5) <= (.74 - u) * (.22 / .38): hit += 1
            a = hit / 16
            row += bytes([int(17 + (255 - 17) * a), int(17 + (159 - 17) * a), int(17 + (10 - 17) * a)])
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b''))
out = sys.argv[1] if len(sys.argv) > 1 else '.'
for n in (180, 192, 512): png(n, os.path.join(out, f'icon-{n}.png'))
