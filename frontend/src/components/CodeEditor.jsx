import { useRef, useEffect, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import './CodeEditor.css'

const KEYWORDS = [
  'pragma','solidity','contract','function','mapping','address','uint','uint256',
  'uint8','uint16','uint32','uint128','int','int256','bool','string','bytes',
  'bytes32','public','private','external','internal','view','pure','payable',
  'returns','return','if','else','for','while','do','break','continue','require',
  'revert','assert','emit','event','modifier','struct','enum','import','true',
  'false','msg','sender','value','this','new','delete','memory','storage',
  'calldata','indexed','override','virtual','abstract','constructor','fallback',
  'receive','interface','library','using','is','as','type','unchecked',
]

function highlight(code) {
  if (!code) return ''
  let s = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Block comments  /* … */
  s = s.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="syn-comment">$1</span>')
  // Line comments
  s = s.replace(/(\/\/[^\n]*)/g, '<span class="syn-comment">$1</span>')
  // Strings
  s = s.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="syn-string">$1</span>')
  // Numbers
  s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syn-number">$1</span>')
  // Keywords
  const kwRe = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g')
  s = s.replace(kwRe, '<span class="syn-keyword">$1</span>')
  // Function-call names (identifiers before '(', excluding keywords already wrapped)
  s = s.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, (m, name) =>
    m.startsWith('<span') ? m
      : `<span class="syn-function">${name}</span>`
  )
  return s
}

/**
 * Fully self-contained scrollable code panel.
 * Line numbers stay fixed; code area scrolls both axes independently.
 * showCopy: show a copy icon in the top-right corner.
 */
export default function CodeEditor({
  value = '',
  onChange,
  readOnly = false,
  highlight: hlStyle,
  showCopy = false,
  maxHeight = '320px',
}) {
  const containerRef = useRef()   // outer wrapper (clips overflow)
  const lineNumRef   = useRef()   // left column — scrolls vertically only
  const codeAreaRef  = useRef()   // right column — scrolls both axes
  const textareaRef  = useRef()   // transparent textarea (editable mode)
  const [copied, setCopied]       = useState(false)

  const lines = (value || '').split('\n')

  // Keep line-number column in sync with vertical scroll of the code area
  const syncLineNumbers = useCallback(() => {
    if (lineNumRef.current && codeAreaRef.current) {
      lineNumRef.current.scrollTop = codeAreaRef.current.scrollTop
    }
  }, [])

  // In editable mode keep the hidden textarea in sync too
  const syncTextarea = useCallback(() => {
    if (textareaRef.current && codeAreaRef.current) {
      textareaRef.current.scrollTop  = codeAreaRef.current.scrollTop
      textareaRef.current.scrollLeft = codeAreaRef.current.scrollLeft
    }
  }, [])

  // When textarea scrolls (user typed / arrow-keyed) mirror back to visible layer
  const onTextareaScroll = useCallback(() => {
    if (textareaRef.current && codeAreaRef.current) {
      codeAreaRef.current.scrollTop  = textareaRef.current.scrollTop
      codeAreaRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
    syncLineNumbers()
  }, [syncLineNumbers])

  const onCodeAreaScroll = useCallback(() => {
    syncLineNumbers()
    syncTextarea()
  }, [syncLineNumbers, syncTextarea])

  // Support Shift+wheel → horizontal scroll on the code area
  const onWheel = useCallback((e) => {
    if (e.shiftKey && codeAreaRef.current) {
      e.preventDefault()
      codeAreaRef.current.scrollLeft += e.deltaY
    }
  }, [])

  useEffect(() => {
    const el = codeAreaRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const accentColor = hlStyle === 'red'
    ? 'rgba(239,68,68,0.18)'
    : hlStyle === 'green'
    ? 'rgba(34,197,94,0.12)'
    : 'transparent'

  return (
    <div
      ref={containerRef}
      className="ce-outer"
      style={{ borderTop: `2px solid ${accentColor}`, maxHeight }}
    >
      {/* Copy button */}
      {showCopy && (
        <button className="ce-copy-btn" onClick={handleCopy} title="Copy code">
          {copied ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
        </button>
      )}

      {/* Line-number gutter — scrolls vertically only, clipped horizontally */}
      <div className="ce-gutter" ref={lineNumRef}>
        {lines.map((_, i) => (
          <div key={i} className="ce-line-num">{i + 1}</div>
        ))}
      </div>

      {/* Scrollable code area */}
      <div
        className="ce-code-area"
        ref={codeAreaRef}
        onScroll={onCodeAreaScroll}
      >
        <pre
          className="ce-highlight"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlight(value) + '\n' }}
        />

        {/* Transparent textarea sits on top in editable mode */}
        {!readOnly && (
          <textarea
            ref={textareaRef}
            className="ce-textarea"
            value={value}
            onChange={e => onChange(e.target.value)}
            onScroll={onTextareaScroll}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
          />
        )}
      </div>
    </div>
  )
}
