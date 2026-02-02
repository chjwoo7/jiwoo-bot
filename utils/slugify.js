/**
 * Convert text to URL-safe slug
 * Example: "Pascal CTF 2026" → "pascal-ctf-2026"
 */
export function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove special chars
        .replace(/[\s_-]+/g, '-')  // Replace spaces/underscores with single dash
        .replace(/^-+|-+$/g, '');  // Remove leading/trailing dashes
}
