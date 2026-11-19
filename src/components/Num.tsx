import { animate, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'

/** A number that eases from its last value to each new one. */
export function Num({ value, digits = 0, className }: { value: number; digits?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef<number | null>(null)
  const reduced = useReducedMotion()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const text = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    const from = shown.current
    if (from === null || reduced) {
      el.textContent = text(value)
      shown.current = value
      return
    }
    const controls = animate(from, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = text(v)
        shown.current = v
      },
    })
    return () => controls.stop()
  }, [value, digits, reduced])

  return <span ref={ref} className={className} />
}
